"""Reporter: formats and sends the end-of-cycle report to Discord and/or
email. Reporting failures never crash the run — they're logged and
swallowed, since a failed notification shouldn't be confused with a failed
engineering cycle.
"""

from __future__ import annotations

import logging
import smtplib
from dataclasses import dataclass, field
from email.mime.text import MIMEText

import requests

from agent.config import ReportingConfig

logger = logging.getLogger(__name__)


@dataclass
class CycleReport:
    outcome: str  # "pr_opened" | "no_op" | "failed"
    task: str
    files_changed: list[str] = field(default_factory=list)
    tests_passed: bool = False
    pr_url: str | None = None
    summary: str = ""
    remaining_tasks: list[str] = field(default_factory=list)
    suggested_priorities: list[str] = field(default_factory=list)
    error: str | None = None

    def to_markdown(self) -> str:
        lines = [f"## Autonomous AI Engineer — cycle report\n"]
        lines.append(f"**Outcome:** {self.outcome}")
        lines.append(f"**Task:** {self.task or '(none)'}")
        if self.files_changed:
            lines.append(f"**Files changed:** {', '.join(self.files_changed)}")
        lines.append(f"**Tests passed:** {'yes' if self.tests_passed else 'no'}")
        if self.pr_url:
            lines.append(f"**Pull request:** {self.pr_url}")
        if self.summary:
            lines.append(f"\n**Summary:**\n{self.summary}")
        if self.remaining_tasks:
            lines.append("\n**Remaining tasks:**")
            lines.extend(f"- {t}" for t in self.remaining_tasks)
        if self.suggested_priorities:
            lines.append("\n**Suggested next priorities:**")
            lines.extend(f"- {p}" for p in self.suggested_priorities)
        if self.error:
            lines.append(f"\n**Error:** {self.error}")
        return "\n".join(lines)


def send_discord(webhook_url: str, report: CycleReport) -> None:
    payload = {"content": report.to_markdown()[:1900]}
    try:
        resp = requests.post(webhook_url, json=payload, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.error("Failed to send Discord report: %s", exc)


def send_email(
    smtp_host: str,
    smtp_port: int,
    smtp_user: str,
    smtp_password: str,
    email_from: str,
    email_to: str,
    report: CycleReport,
) -> None:
    msg = MIMEText(report.to_markdown(), "plain", "utf-8")
    msg["Subject"] = f"[AI Engineer] {report.outcome}: {report.task[:60]}"
    msg["From"] = email_from
    msg["To"] = email_to
    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(email_from, [email_to], msg.as_string())
    except (smtplib.SMTPException, OSError) as exc:
        logger.error("Failed to send email report: %s", exc)


def dispatch_report(config: ReportingConfig, report: CycleReport, env: dict) -> None:
    print(report.to_markdown())  # always goes to the Action's log too

    if config.discord_enabled and config.discord_webhook_url:
        send_discord(config.discord_webhook_url, report)

    if config.email_enabled and config.email_to:
        smtp_host = env.get("SMTP_HOST", "")
        smtp_port = int(env.get("SMTP_PORT", "587") or 587)
        smtp_user = env.get("SMTP_USER", "")
        smtp_password = env.get("SMTP_PASSWORD", "")
        if smtp_host and smtp_user and smtp_password:
            send_email(
                smtp_host,
                smtp_port,
                smtp_user,
                smtp_password,
                config.email_from or smtp_user,
                config.email_to,
                report,
            )
        else:
            logger.warning("Email reporting enabled but SMTP_* env vars are incomplete; skipping.")
