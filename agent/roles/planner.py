"""Planner: looks at the roadmap, memory, open issues, and TODO comments,
then commits to exactly ONE bounded task for this cycle. Never proposes
more than the configured file/line budget.
"""

from __future__ import annotations

import fnmatch
import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path

from agent.config import AgentConfig
from agent.llm_client import LLMClient
from agent.memory import AgentMemory

logger = logging.getLogger(__name__)

TODO_PATTERN = re.compile(r"(TODO|FIXME|XXX)[:\s](.+)", re.IGNORECASE)

PLANNER_SYSTEM_PROMPT = """You are the Planner role inside an autonomous \
software engineering agent. Your only job is to choose ONE small, well-scoped \
task for this work cycle. You do not write code yourself.

Rules:
- Pick exactly one task. Do not propose a list of tasks to do "eventually."
- The task must be completable within {max_files} files and roughly \
{max_lines} changed lines. If a candidate is bigger than that, break off the \
smallest useful slice of it instead.
- Prefer fixing failing/missing tests, addressing explicit TODOs, and small \
roadmap items over large speculative features.
- Never propose touching protected paths: {protected_paths}.
- If nothing reasonable is pending, say so explicitly — do not invent work.

Respond ONLY with JSON, no prose, no markdown fences:
{{
  "task": "one-sentence description of the chosen task",
  "rationale": "why this task, and why now",
  "target_files": ["best-guess list of files likely involved"],
  "is_noop": false
}}
If there is genuinely nothing useful to do, set "is_noop": true and leave \
the other fields as empty/best-effort.
"""


@dataclass
class PlannedTask:
    task: str
    rationale: str
    target_files: list[str]
    is_noop: bool


def _scan_todos(repo_dir: Path, globs: list[str], limit: int = 30) -> list[str]:
    found: list[str] = []
    for pattern in globs:
        for file_path in repo_dir.glob(pattern):
            if not file_path.is_file():
                continue
            if ".git" in file_path.parts or ".agent" in file_path.parts:
                continue
            try:
                text = file_path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            for i, line in enumerate(text.splitlines(), start=1):
                match = TODO_PATTERN.search(line)
                if match:
                    rel = file_path.relative_to(repo_dir)
                    found.append(f"{rel}:{i}: {match.group(0).strip()}")
                    if len(found) >= limit:
                        return found
    return found


def _read_roadmap(repo_dir: Path, roadmap_path: str) -> str:
    path = repo_dir / roadmap_path
    if path.exists():
        return path.read_text(encoding="utf-8", errors="ignore")[:4000]
    return "(no ROADMAP.md found)"


def _parse_response(text: str) -> PlannedTask:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        cleaned = cleaned.split("\n", 1)[-1] if cleaned.lower().startswith("json") else cleaned
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Planner returned non-JSON output: {text[:300]}") from exc

    return PlannedTask(
        task=data.get("task", ""),
        rationale=data.get("rationale", ""),
        target_files=data.get("target_files", []) or [],
        is_noop=bool(data.get("is_noop", False)),
    )


def plan(
    config: AgentConfig,
    llm: LLMClient,
    repo_dir: Path,
    memory: AgentMemory,
    open_issues: list[dict],
) -> PlannedTask:
    roadmap_text = _read_roadmap(repo_dir, config.planning.roadmap_path)
    todos = (
        _scan_todos(repo_dir, config.planning.todo_file_globs)
        if config.planning.scan_todo_comments
        else []
    )

    issues_text = "\n".join(
        f"- #{issue['number']} {issue['title']} (labels: {', '.join(issue['labels'])})"
        for issue in open_issues[: config.planning.max_candidate_tasks]
    ) or "(no open issues)"

    todos_text = "\n".join(todos[:30]) or "(no TODO/FIXME comments found)"

    user_prompt = f"""## Roadmap (ROADMAP.md)
{roadmap_text}

## Open GitHub issues
{issues_text}

## TODO/FIXME comments found in code
{todos_text}

## Agent memory (past work, conventions, mistakes to avoid)
{memory.to_prompt_context()}

Choose the single best task for this cycle."""

    system_prompt = PLANNER_SYSTEM_PROMPT.format(
        max_files=config.limits.max_files_per_run,
        max_lines=config.limits.max_lines_changed_per_run,
        protected_paths=", ".join(config.protected_paths),
    )

    response = llm.complete(system=system_prompt, user=user_prompt)
    return _parse_response(response.text)
