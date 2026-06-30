"""All git/GitHub side effects live here. This is the only module allowed
to touch the filesystem's git state or call the GitHub API for writes.
"""

from __future__ import annotations

import fnmatch
import logging
import subprocess
from dataclasses import dataclass
from pathlib import Path

from github import Github
from github.Repository import Repository
from unidiff import PatchSet

from agent.config import AgentConfig

logger = logging.getLogger(__name__)


class GitOperationError(RuntimeError):
    pass


class ProtectedPathError(RuntimeError):
    """Raised when a proposed change touches a protected path. Never bypassed."""


@dataclass
class AppliedDiffResult:
    files_changed: list[str]
    lines_added: int
    lines_removed: int


def _normalize_path(path: str) -> str:
    """Strips a leading './' prefix without mangling leading-dot filenames
    like '.env' (plain str.lstrip would strip those dots too).
    """
    return path[2:] if path.startswith("./") else path


def is_path_protected(path: str, protected_patterns: list[str]) -> bool:
    """Single source of truth for the protected-path check. Used by the
    diff-apply step AND by anything else that proposes touching a file.
    """
    normalized = _normalize_path(path)
    for pattern in protected_patterns:
        if fnmatch.fnmatch(normalized, pattern):
            return True
    return False


def matches_any(path: str, patterns: list[str]) -> bool:
    normalized = _normalize_path(path)
    return any(fnmatch.fnmatch(normalized, p) for p in patterns)


class GitHubOps:
    def __init__(self, config: AgentConfig, repo_dir: Path):
        self.config = config
        self.repo_dir = repo_dir
        self._gh = Github(config.github_token)

        full_name = (
            config.target_repo.full_name
            if not config.target_repo.same_repo_as_workflow
            else config.workflow_repo_full_name
        )
        if not full_name:
            raise GitOperationError(
                "Could not determine target repo full_name. Set target_repo.full_name "
                "in config.yaml or run inside the target repo's own workflow."
            )
        self.full_name = full_name
        self._repo: Repository = self._gh.get_repo(full_name)

    # -- repo prep -----------------------------------------------------

    def _run(self, args: list[str], cwd: Path | None = None) -> str:
        proc = subprocess.run(
            args,
            cwd=str(cwd or self.repo_dir),
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode != 0:
            raise GitOperationError(
                f"Command failed: {' '.join(args)}\nstdout: {proc.stdout}\nstderr: {proc.stderr}"
            )
        return proc.stdout.strip()

    def clone_or_update(self) -> None:
        clone_url = f"https://x-access-token:{self.config.github_token}@github.com/{self.full_name}.git"
        if (self.repo_dir / ".git").exists():
            self._run(["git", "fetch", "origin"])
            self._run(["git", "checkout", self.config.target_repo.default_branch])
            self._run(["git", "pull", "origin", self.config.target_repo.default_branch])
        else:
            self.repo_dir.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(
                ["git", "clone", clone_url, str(self.repo_dir)],
                check=True,
                capture_output=True,
                text=True,
            )
        self._run(["git", "config", "user.name", self.config.git.commit_author_name])
        self._run(["git", "config", "user.email", self.config.git.commit_author_email])

    def create_branch(self, branch_name: str) -> None:
        self._run(["git", "checkout", "-b", branch_name])

    # -- diff handling ---------------------------------------------------

    def validate_diff_paths(self, diff_text: str) -> list[str]:
        """Parses a unified diff and returns the list of touched file paths.
        Raises ProtectedPathError if any touched path is protected. This is
        a hard stop — callers must not catch-and-ignore this exception.
        """
        patch = PatchSet(diff_text)
        touched: list[str] = []
        for patched_file in patch:
            path = patched_file.path
            touched.append(path)
            if is_path_protected(path, self.config.protected_paths):
                raise ProtectedPathError(
                    f"Refusing to modify protected path: {path}"
                )
        if len(touched) > self.config.limits.max_files_per_run:
            raise GitOperationError(
                f"Diff touches {len(touched)} files, exceeding "
                f"max_files_per_run={self.config.limits.max_files_per_run}"
            )
        return touched

    def count_changed_lines(self, diff_text: str) -> int:
        patch = PatchSet(diff_text)
        total = 0
        for patched_file in patch:
            total += patched_file.added + patched_file.removed
        return total

    def apply_diff(self, diff_text: str) -> AppliedDiffResult:
        touched_paths = self.validate_diff_paths(diff_text)
        changed_lines = self.count_changed_lines(diff_text)
        if changed_lines > self.config.limits.max_lines_changed_per_run:
            raise GitOperationError(
                f"Diff changes {changed_lines} lines, exceeding "
                f"max_lines_changed_per_run={self.config.limits.max_lines_changed_per_run}"
            )

        patch_path = self.repo_dir / ".agent_pending.patch"
        patch_path.write_text(diff_text, encoding="utf-8")
        try:
            self._run(["git", "apply", "--whitespace=nowarn", str(patch_path.name)])
        finally:
            patch_path.unlink(missing_ok=True)

        patch = PatchSet(diff_text)
        added = sum(f.added for f in patch)
        removed = sum(f.removed for f in patch)
        return AppliedDiffResult(files_changed=touched_paths, lines_added=added, lines_removed=removed)

    def has_uncommitted_changes(self) -> bool:
        status = self._run(["git", "status", "--porcelain"])
        return bool(status.strip())

    def discard_changes(self) -> None:
        self._run(["git", "checkout", "--", "."])
        self._run(["git", "clean", "-fd"])

    def commit_all(self, message: str) -> None:
        self._run(["git", "add", "-A"])
        self._run(["git", "commit", "-m", message])

    def push_branch(self, branch_name: str) -> None:
        self._run(["git", "push", "origin", branch_name, "--force-with-lease"])

    # -- PR / issues / labels --------------------------------------------

    def open_pull_request(
        self,
        branch_name: str,
        title: str,
        body: str,
        needs_human_review: bool = False,
    ) -> str:
        pr = self._repo.create_pull(
            title=title,
            body=body,
            head=branch_name,
            base=self.config.target_repo.default_branch,
        )
        labels = [self.config.git.pr_label]
        if needs_human_review:
            labels.append("needs-human-review")
        try:
            pr.add_to_labels(*labels)
        except Exception:  # noqa: BLE001
            logger.warning("Could not add labels %s to PR #%s", labels, pr.number)
        return pr.html_url

    def list_open_issues(self, limit: int = 15) -> list[dict]:
        issues = []
        for issue in self._repo.get_issues(state="open")[:limit]:
            if issue.pull_request:
                continue
            issues.append(
                {
                    "number": issue.number,
                    "title": issue.title,
                    "body": (issue.body or "")[:1000],
                    "labels": [lbl.name for lbl in issue.labels],
                }
            )
        return issues

    def diff_touches_schema(self, touched_paths: list[str]) -> bool:
        return any(matches_any(p, self.config.schema_review_patterns) for p in touched_paths)
