"""Tester: runs the repo's actual build/test commands (no LLM call here —
this is the one role that's pure subprocess execution, by design, so test
results can never be hallucinated).
"""

from __future__ import annotations

import logging
import subprocess
from dataclasses import dataclass
from pathlib import Path

from agent.config import AgentConfig

logger = logging.getLogger(__name__)


@dataclass
class TestRunResult:
    passed: bool
    stdout: str
    stderr: str
    command: str
    timed_out: bool = False


def _run_command(command: str, cwd: Path, timeout: int) -> TestRunResult:
    if not command.strip():
        return TestRunResult(passed=True, stdout="(no command configured, skipped)", stderr="", command=command)
    try:
        proc = subprocess.run(
            command,
            shell=True,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return TestRunResult(
            passed=proc.returncode == 0,
            stdout=proc.stdout[-8000:],
            stderr=proc.stderr[-8000:],
            command=command,
        )
    except subprocess.TimeoutExpired as exc:
        return TestRunResult(
            passed=False,
            stdout=(exc.stdout or "")[-8000:] if isinstance(exc.stdout, str) else "",
            stderr=f"Command timed out after {timeout}s",
            command=command,
            timed_out=True,
        )


def run_build(config: AgentConfig, repo_dir: Path) -> TestRunResult:
    return _run_command(config.testing.build_command, repo_dir, config.testing.test_timeout_seconds)


def run_tests(config: AgentConfig, repo_dir: Path) -> TestRunResult:
    return _run_command(config.testing.test_command, repo_dir, config.testing.test_timeout_seconds)
