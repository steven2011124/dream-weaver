"""Developer: turns a PlannedTask into a unified diff. Never executes
anything itself — produces text only, which github_client validates and
applies.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from agent.config import AgentConfig
from agent.llm_client import LLMClient
from agent.memory import AgentMemory
from agent.roles.planner import PlannedTask

DEVELOPER_SYSTEM_PROMPT = """You are the Developer role inside an autonomous \
software engineering agent. You implement exactly one task as a single \
unified diff (the format produced by `git diff`), and nothing else.

Hard rules:
- Output ONLY a unified diff. No prose before or after. No markdown fences.
- Touch at most {max_files} files and roughly {max_lines} changed lines \
total. If the task is bigger than that, implement the smallest complete \
useful slice and note what's left for a future cycle in a code comment.
- NEVER modify these paths under any circumstance: {protected_paths}.
- Use unambiguous file paths relative to the repo root.
- Diff hunks must apply cleanly with `git apply` — use correct context \
lines and correct line numbers based on the file contents given to you.
- Match the existing code style/conventions visible in the provided files.
- Do not invent files that don't exist unless the task explicitly requires \
a new file, and if so, use a `--- /dev/null` style diff header correctly.
- Add or update tests for any behavior change when the repo has a test \
suite already (inferred from the file listing).
"""


@dataclass
class DeveloperOutput:
    diff_text: str


def _gather_file_contents(repo_dir: Path, target_files: list[str], max_chars: int = 12000) -> str:
    blocks = []
    used = 0
    for rel_path in target_files:
        path = repo_dir / rel_path
        if not path.exists() or not path.is_file():
            continue
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        snippet = content[: max_chars - used]
        used += len(snippet)
        blocks.append(f"### {rel_path}\n```\n{snippet}\n```")
        if used >= max_chars:
            break
    return "\n\n".join(blocks) if blocks else "(none of the target files currently exist)"


def _extract_diff(text: str) -> str:
    """Strips any accidental markdown fencing the model adds despite
    instructions, and trims to the diff body.
    """
    cleaned = text.strip()
    fence_match = re.search(r"```(?:diff|patch)?\n(.*?)```", cleaned, re.DOTALL)
    if fence_match:
        cleaned = fence_match.group(1).strip()
    return cleaned


def implement(
    config: AgentConfig,
    llm: LLMClient,
    repo_dir: Path,
    memory: AgentMemory,
    task: PlannedTask,
    reviewer_feedback: str | None = None,
) -> DeveloperOutput:
    file_contents = _gather_file_contents(repo_dir, task.target_files)

    feedback_block = ""
    if reviewer_feedback:
        feedback_block = f"\n## Reviewer feedback on your previous attempt\n{reviewer_feedback}\n"

    user_prompt = f"""## Task
{task.task}

## Rationale
{task.rationale}

## Relevant existing file contents
{file_contents}

## Agent memory (conventions, past mistakes)
{memory.to_prompt_context(max_history=5)}
{feedback_block}
Produce the unified diff implementing this task now."""

    system_prompt = DEVELOPER_SYSTEM_PROMPT.format(
        max_files=config.limits.max_files_per_run,
        max_lines=config.limits.max_lines_changed_per_run,
        protected_paths=", ".join(config.protected_paths),
    )

    response = llm.complete(system=system_prompt, user=user_prompt, max_tokens=8192)
    diff_text = _extract_diff(response.text)
    return DeveloperOutput(diff_text=diff_text)
