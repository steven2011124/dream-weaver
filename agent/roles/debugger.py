"""Debugger: given a diff that broke the build/tests, proposes a corrective
diff. Operates on top of the already-applied changes (i.e. produces an
additional incremental diff), not a full rewrite.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from agent.config import AgentConfig
from agent.llm_client import LLMClient
from agent.roles.planner import PlannedTask
from agent.roles.tester import TestRunResult

DEBUGGER_SYSTEM_PROMPT = """You are the Debugger role inside an autonomous \
software engineering agent. The previous diff applied successfully but the \
build or test suite is now failing. Your job is to produce a SMALL, \
incremental unified diff (on top of the current working tree, which already \
includes the previous changes) that fixes the failure.

Hard rules:
- Output ONLY a unified diff, no prose, no markdown fences.
- Do not revert the original task's intent — fix the actual bug.
- If the failure is unrelated to the change (flaky/pre-existing failure), \
say so by outputting exactly: NO_FIX_POSSIBLE: <one sentence reason> \
instead of a diff.
- Stay within {max_files} files and roughly {max_lines} additional changed \
lines.
- NEVER modify: {protected_paths}.
"""


@dataclass
class DebugOutput:
    diff_text: str
    no_fix_possible: bool
    reason: str | None = None


def _extract_diff(text: str) -> str:
    cleaned = text.strip()
    fence_match = re.search(r"```(?:diff|patch)?\n(.*?)```", cleaned, re.DOTALL)
    if fence_match:
        cleaned = fence_match.group(1).strip()
    return cleaned


def debug(
    config: AgentConfig,
    llm: LLMClient,
    repo_dir: Path,
    task: PlannedTask,
    failed_result: TestRunResult,
    attempt_number: int,
) -> DebugOutput:
    system_prompt = DEBUGGER_SYSTEM_PROMPT.format(
        max_files=config.limits.max_files_per_run,
        max_lines=config.limits.max_lines_changed_per_run,
        protected_paths=", ".join(config.protected_paths),
    )

    user_prompt = f"""## Original task
{task.task}

## Failed command
{failed_result.command}

## stdout (tail)
{failed_result.stdout}

## stderr (tail)
{failed_result.stderr}

## Debug attempt
{attempt_number}

Produce a fix now."""

    response = llm.complete(system=system_prompt, user=user_prompt, max_tokens=6000)
    text = response.text.strip()

    if text.startswith("NO_FIX_POSSIBLE"):
        reason = text.split(":", 1)[1].strip() if ":" in text else "Unknown reason."
        return DebugOutput(diff_text="", no_fix_possible=True, reason=reason)

    return DebugOutput(diff_text=_extract_diff(text), no_fix_possible=False)
