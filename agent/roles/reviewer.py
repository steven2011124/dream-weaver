"""Reviewer: critiques a diff for correctness, scope creep, and style before
it ever reaches the test runner. Can request changes; bounded retries are
enforced by the orchestrator, not here.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from agent.config import AgentConfig
from agent.llm_client import LLMClient
from agent.roles.planner import PlannedTask

REVIEWER_SYSTEM_PROMPT = """You are the Reviewer role inside an autonomous \
software engineering agent. You review a proposed diff against the task it \
claims to implement. You do not write code yourself.

Check for:
- Does the diff actually implement the stated task, fully or as a sensible \
partial slice?
- Scope creep: does it touch unrelated files or do unrelated things?
- Obvious bugs, logic errors, or unhandled edge cases.
- Whether it follows the existing code's conventions.
- Whether it appears to touch anything that should never be touched: {protected_paths}.
- Whether secrets, credentials, or API keys appear to be hardcoded anywhere \
in the diff.

Respond ONLY with JSON, no prose, no markdown fences:
{{
  "approved": true/false,
  "concerns": ["list of specific, actionable concerns - empty if approved"],
  "severity": "none" | "minor" | "major" | "blocking"
}}
Only set approved=false for "major" or "blocking" severity concerns. Minor \
style nits should not block approval — note them but approve.
"""


@dataclass
class ReviewResult:
    approved: bool
    concerns: list[str]
    severity: str


def _parse(text: str) -> ReviewResult:
    cleaned = text.strip().strip("`")
    if cleaned.lower().startswith("json"):
        cleaned = cleaned.split("\n", 1)[-1]
    data = json.loads(cleaned)
    return ReviewResult(
        approved=bool(data.get("approved", False)),
        concerns=data.get("concerns", []) or [],
        severity=data.get("severity", "none"),
    )


def review(
    config: AgentConfig,
    llm: LLMClient,
    task: PlannedTask,
    diff_text: str,
) -> ReviewResult:
    system_prompt = REVIEWER_SYSTEM_PROMPT.format(
        protected_paths=", ".join(config.protected_paths)
    )
    user_prompt = f"""## Task being implemented
{task.task}

## Proposed diff
```diff
{diff_text}
```

Review this diff now."""

    response = llm.complete(system=system_prompt, user=user_prompt)
    try:
        return _parse(response.text)
    except (json.JSONDecodeError, KeyError):
        # Fail safe: an unparseable review is treated as "not approved"
        # rather than silently passing.
        return ReviewResult(
            approved=False,
            concerns=["Reviewer output could not be parsed; treating as rejection."],
            severity="major",
        )
