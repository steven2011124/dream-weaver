"""Security Auditor: a lightweight scan over the final diff for common
vulnerability patterns and obviously hardcoded secrets, run just before the
PR is opened. This is a backstop, not a replacement for real SAST tooling.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

from agent.llm_client import LLMClient

SECRET_PATTERNS = [
    re.compile(r"(?i)(api[_-]?key|secret|password|token)\s*=\s*['\"][^'\"]{8,}['\"]"),
    re.compile(r"AKIA[0-9A-Z]{16}"),  # AWS access key id
    re.compile(r"sk-[a-zA-Z0-9]{20,}"),  # OpenAI/Anthropic-style secret key
    re.compile(r"-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----"),
]

AUDITOR_SYSTEM_PROMPT = """You are the Security Auditor role inside an \
autonomous software engineering agent. Review this diff for common \
vulnerability classes: injection (SQL/command/template), unsafe \
deserialization, path traversal, insecure use of eval/exec, missing input \
validation on user-controlled data, insecure randomness for security \
purposes, and overly permissive CORS/auth checks.

Respond ONLY with JSON, no prose, no markdown fences:
{
  "issues_found": ["specific issue descriptions, empty list if none"],
  "severity": "none" | "low" | "medium" | "high" | "critical"
}
"""


@dataclass
class AuditResult:
    hardcoded_secret_detected: bool
    secret_matches: list[str]
    llm_issues: list[str]
    llm_severity: str


def _scan_for_secrets(diff_text: str) -> list[str]:
    matches = []
    for line in diff_text.splitlines():
        if not line.startswith("+") or line.startswith("+++"):
            continue
        for pattern in SECRET_PATTERNS:
            if pattern.search(line):
                matches.append(line.strip()[:120])
                break
    return matches


def audit(llm: LLMClient, diff_text: str) -> AuditResult:
    secret_matches = _scan_for_secrets(diff_text)

    user_prompt = f"## Diff to audit\n```diff\n{diff_text}\n```"
    response = llm.complete(system=AUDITOR_SYSTEM_PROMPT, user=user_prompt)

    llm_issues: list[str] = []
    llm_severity = "none"
    try:
        cleaned = response.text.strip().strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned.split("\n", 1)[-1]
        data = json.loads(cleaned)
        llm_issues = data.get("issues_found", []) or []
        llm_severity = data.get("severity", "none")
    except (json.JSONDecodeError, KeyError):
        llm_issues = ["Security auditor output could not be parsed."]
        llm_severity = "medium"

    return AuditResult(
        hardcoded_secret_detected=bool(secret_matches),
        secret_matches=secret_matches,
        llm_issues=llm_issues,
        llm_severity=llm_severity,
    )
