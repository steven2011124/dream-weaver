"""Loads and validates config.yaml, merges in environment-provided secrets."""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


class ConfigError(RuntimeError):
    pass


@dataclass
class LLMConfig:
    provider: str
    anthropic_model: str
    openai_model: str
    max_tokens: int
    temperature: float
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None


@dataclass
class LimitsConfig:
    max_files_per_run: int
    max_lines_changed_per_run: int
    max_reviewer_retries: int
    max_debugger_retries: int
    max_planner_retries: int


@dataclass
class TestingConfig:
    test_command: str
    test_timeout_seconds: int
    build_command: str


@dataclass
class GitConfig:
    branch_prefix: str
    commit_author_name: str
    commit_author_email: str
    open_pr: bool
    pr_label: str


@dataclass
class ReportingConfig:
    discord_enabled: bool
    email_enabled: bool
    email_to: str
    email_from: str
    include_diff_in_report: bool
    discord_webhook_url: str | None = None


@dataclass
class PlanningConfig:
    roadmap_path: str
    memory_path: str
    scan_todo_comments: bool
    todo_file_globs: list[str]
    consider_open_issues: bool
    max_candidate_tasks: int


@dataclass
class TargetRepoConfig:
    full_name: str
    default_branch: str
    same_repo_as_workflow: bool = field(init=False, default=True)

    def __post_init__(self) -> None:
        self.same_repo_as_workflow = not bool(self.full_name.strip())


@dataclass
class AgentConfig:
    target_repo: TargetRepoConfig
    llm: LLMConfig
    planning: PlanningConfig
    limits: LimitsConfig
    testing: TestingConfig
    protected_paths: list[str]
    schema_review_patterns: list[str]
    git: GitConfig
    reporting: ReportingConfig
    github_token: str
    workflow_repo_full_name: str


def _require_env(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        raise ConfigError(f"Required environment variable {name} is not set.")
    return val


def load_config(path: str | Path = "config.yaml") -> AgentConfig:
    path = Path(path)
    if not path.exists():
        raise ConfigError(f"Config file not found: {path}")

    with path.open("r", encoding="utf-8") as f:
        raw: dict[str, Any] = yaml.safe_load(f) or {}

    try:
        target_repo = TargetRepoConfig(
            full_name=raw.get("target_repo", {}).get("full_name", ""),
            default_branch=raw.get("target_repo", {}).get("default_branch", "main"),
        )

        llm_raw = raw.get("llm", {})
        llm = LLMConfig(
            provider=llm_raw.get("provider", "auto"),
            anthropic_model=llm_raw.get("anthropic_model", "claude-opus-4-6"),
            openai_model=llm_raw.get("openai_model", "gpt-4.1"),
            max_tokens=int(llm_raw.get("max_tokens", 4096)),
            temperature=float(llm_raw.get("temperature", 0.2)),
            anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY"),
            openai_api_key=os.environ.get("OPENAI_API_KEY"),
        )
        if llm.provider not in ("anthropic", "openai", "auto"):
            raise ConfigError(f"Invalid llm.provider: {llm.provider}")
        if llm.provider == "anthropic" and not llm.anthropic_api_key:
            raise ConfigError("llm.provider=anthropic but ANTHROPIC_API_KEY is not set.")
        if llm.provider == "openai" and not llm.openai_api_key:
            raise ConfigError("llm.provider=openai but OPENAI_API_KEY is not set.")
        if llm.provider == "auto" and not (llm.anthropic_api_key or llm.openai_api_key):
            raise ConfigError("llm.provider=auto but neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is set.")

        planning_raw = raw.get("planning", {})
        planning = PlanningConfig(
            roadmap_path=planning_raw.get("roadmap_path", "ROADMAP.md"),
            memory_path=planning_raw.get("memory_path", ".agent/memory.json"),
            scan_todo_comments=bool(planning_raw.get("scan_todo_comments", True)),
            todo_file_globs=list(planning_raw.get("todo_file_globs", ["**/*.py"])),
            consider_open_issues=bool(planning_raw.get("consider_open_issues", True)),
            max_candidate_tasks=int(planning_raw.get("max_candidate_tasks", 8)),
        )

        limits_raw = raw.get("limits", {})
        limits = LimitsConfig(
            max_files_per_run=int(limits_raw.get("max_files_per_run", 6)),
            max_lines_changed_per_run=int(limits_raw.get("max_lines_changed_per_run", 400)),
            max_reviewer_retries=int(limits_raw.get("max_reviewer_retries", 2)),
            max_debugger_retries=int(limits_raw.get("max_debugger_retries", 3)),
            max_planner_retries=int(limits_raw.get("max_planner_retries", 1)),
        )

        testing_raw = raw.get("testing", {})
        testing = TestingConfig(
            test_command=testing_raw.get("test_command", "pytest -q"),
            test_timeout_seconds=int(testing_raw.get("test_timeout_seconds", 600)),
            build_command=testing_raw.get("build_command", "") or "",
        )

        git_raw = raw.get("git", {})
        git = GitConfig(
            branch_prefix=git_raw.get("branch_prefix", "agent/"),
            commit_author_name=git_raw.get("commit_author_name", "Autonomous AI Engineer"),
            commit_author_email=git_raw.get("commit_author_email", "agent@example.local"),
            open_pr=bool(git_raw.get("open_pr", True)),
            pr_label=git_raw.get("pr_label", "ai-generated"),
        )

        reporting_raw = raw.get("reporting", {})
        reporting = ReportingConfig(
            discord_enabled=bool(reporting_raw.get("discord_enabled", False)),
            email_enabled=bool(reporting_raw.get("email_enabled", False)),
            email_to=reporting_raw.get("email_to", ""),
            email_from=reporting_raw.get("email_from", ""),
            include_diff_in_report=bool(reporting_raw.get("include_diff_in_report", False)),
            discord_webhook_url=os.environ.get("DISCORD_WEBHOOK_URL"),
        )

        github_token = os.environ.get("GH_PAT") or os.environ.get("GITHUB_TOKEN")
        if not github_token:
            raise ConfigError("Neither GH_PAT nor GITHUB_TOKEN is set in the environment.")

        workflow_repo_full_name = os.environ.get("GITHUB_REPOSITORY", "")

        return AgentConfig(
            target_repo=target_repo,
            llm=llm,
            planning=planning,
            limits=limits,
            testing=testing,
            protected_paths=list(raw.get("protected_paths", [])),
            schema_review_patterns=list(raw.get("schema_review", {}).get("patterns", [])),
            git=git,
            reporting=reporting,
            github_token=github_token,
            workflow_repo_full_name=workflow_repo_full_name,
        )
    except ConfigError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise ConfigError(f"Failed to parse config.yaml: {exc}") from exc


def fail_fast(msg: str) -> None:
    print(f"[CONFIG ERROR] {msg}", file=sys.stderr)
    sys.exit(1)
