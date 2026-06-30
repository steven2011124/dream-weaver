#!/usr/bin/env python3
"""Entrypoint for the Autonomous AI Engineer. Invoked once per GitHub
Actions run. Loads config, runs exactly one cycle, exits with a status
code reflecting whether the cycle succeeded.
"""

from __future__ import annotations

import logging
import sys

from agent.config import ConfigError, fail_fast, load_config
from agent.orchestrator import run_and_report


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    try:
        config = load_config("config.yaml")
    except ConfigError as exc:
        fail_fast(str(exc))
        return 1  # unreachable, fail_fast exits, but keeps type-checkers happy

    return run_and_report(config)


if __name__ == "__main__":
    sys.exit(main())
