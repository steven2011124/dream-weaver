"""Documentation Writer: produces a CHANGELOG entry and, if relevant,
suggested doc updates as plain text for the PR body. Does not directly
modify arbitrary doc files to keep the diff surface predictable — it
contributes content the orchestrator includes in the PR description and
appends to CHANGELOG.md.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path

from agent.llm_client import LLMClient
from agent.roles.planner import PlannedTask

DOC_WRITER_SYSTEM_PROMPT = """You are the Documentation Writer role inside \
an autonomous software engineering agent. Given a completed task and its \
diff, write:
1. A one-line CHANGELOG entry (Keep a Changelog style, no heading, just the \
bullet text starting with a verb, e.g. "Added retry logic to the STK push client.")
2. A short PR description (2-4 sentences) explaining what changed and why, \
written for a human reviewer who has not seen the diff yet.

Respond ONLY with JSON, no prose, no markdown fences:
{"changelog_entry": "...", "pr_description": "..."}
"""


@dataclass
class DocOutput:
    changelog_entry: str
    pr_description: str


def write_docs(llm: LLMClient, task: PlannedTask, diff_text: str) -> DocOutput:
    import json

    user_prompt = f"""## Task
{task.task}

## Diff
```diff
{diff_text}
```
"""
    response = llm.complete(system=DOC_WRITER_SYSTEM_PROMPT, user=user_prompt)
    try:
        cleaned = response.text.strip().strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned.split("\n", 1)[-1]
        data = json.loads(cleaned)
        return DocOutput(
            changelog_entry=data.get("changelog_entry", task.task),
            pr_description=data.get("pr_description", task.rationale),
        )
    except (json.JSONDecodeError, KeyError):
        return DocOutput(changelog_entry=task.task, pr_description=task.rationale)


def append_changelog(repo_dir: Path, entry: str) -> None:
    changelog_path = repo_dir / "CHANGELOG.md"
    today = date.today().isoformat()
    line = f"- {entry} ({today})\n"
    if changelog_path.exists():
        content = changelog_path.read_text(encoding="utf-8")
        if "## Unreleased" in content:
            content = content.replace("## Unreleased\n", f"## Unreleased\n{line}", 1)
        else:
            content = f"## Unreleased\n{line}\n" + content
        changelog_path.write_text(content, encoding="utf-8")
    else:
        changelog_path.write_text(f"# Changelog\n\n## Unreleased\n{line}\n", encoding="utf-8")
