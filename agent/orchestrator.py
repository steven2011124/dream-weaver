"""Orchestrator: runs exactly one wake -> plan -> develop -> review -> test
-> debug -> PR -> report cycle, then exits. This is what main.py calls.
No role is invoked outside of this state machine.
"""

from __future__ import annotations

import logging
import os
import time
import uuid
from pathlib import Path

from agent.config import AgentConfig
from agent.github_client import GitHubOps, GitOperationError, ProtectedPathError
from agent.llm_client import LLMClient
from agent.memory import load_memory, save_memory
from agent.reporter import CycleReport, dispatch_report
from agent.roles import debugger, developer, doc_writer, planner, reviewer, security_auditor
from agent.roles.tester import run_build, run_tests

logger = logging.getLogger(__name__)

REPO_WORKDIR = Path("/tmp/agent_target_repo")


def _build_branch_name(task_slug: str) -> str:
    short_id = uuid.uuid4().hex[:8]
    safe_slug = "".join(c if c.isalnum() or c == "-" else "-" for c in task_slug.lower())[:40]
    return f"agent/{safe_slug}-{short_id}"


def run_cycle(config: AgentConfig) -> CycleReport:
    llm = LLMClient(config.llm)
    git_ops = GitHubOps(config, REPO_WORKDIR)

    logger.info("Cloning/updating target repo %s", git_ops.full_name)
    git_ops.clone_or_update()

    memory_path = REPO_WORKDIR / config.planning.memory_path
    memory = load_memory(memory_path)

    open_issues = git_ops.list_open_issues() if config.planning.consider_open_issues else []

    # -- PLAN -------------------------------------------------------
    logger.info("Planning task...")
    planned = planner.plan(config, llm, REPO_WORKDIR, memory, open_issues)

    if planned.is_noop or not planned.task.strip():
        report = CycleReport(
            outcome="no_op",
            task=planned.task or "(none)",
            summary=planned.rationale or "Planner found nothing actionable this cycle.",
        )
        memory.add_run(task="(no-op)", summary=report.summary, files_changed=[], outcome="skipped")
        save_memory(memory, memory_path)
        return report

    logger.info("Planned task: %s", planned.task)

    branch_name = _build_branch_name(planned.task)
    git_ops.create_branch(branch_name)

    # -- DEVELOP + REVIEW (bounded retry loop) -----------------------
    diff_text = ""
    review_result = None
    reviewer_feedback: str | None = None

    for attempt in range(config.limits.max_reviewer_retries + 1):
        dev_output = developer.implement(
            config, llm, REPO_WORKDIR, memory, planned, reviewer_feedback=reviewer_feedback
        )
        diff_text = dev_output.diff_text
        if not diff_text.strip():
            reviewer_feedback = "Previous attempt produced an empty diff. Produce an actual diff."
            continue

        try:
            review_result = reviewer.review(config, llm, planned, diff_text)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Reviewer call failed: %s", exc)
            review_result = None
            break

        if review_result.approved:
            break
        reviewer_feedback = "; ".join(review_result.concerns) or "Reviewer rejected without specifics."
        logger.info("Reviewer rejected attempt %s: %s", attempt + 1, reviewer_feedback)

    if review_result is not None and not review_result.approved:
        report = CycleReport(
            outcome="failed",
            task=planned.task,
            summary="Reviewer did not approve the diff within the retry budget.",
            error="; ".join(review_result.concerns),
        )
        memory.record_mistake(f"Task '{planned.task}' repeatedly failed review: {reviewer_feedback}")
        memory.add_run(task=planned.task, summary=report.summary, files_changed=[], outcome="failed")
        save_memory(memory, memory_path)
        return report

    # -- APPLY DIFF (protected-path + size enforcement happens here) --
    try:
        applied = git_ops.apply_diff(diff_text)
    except (ProtectedPathError, GitOperationError) as exc:
        report = CycleReport(
            outcome="failed",
            task=planned.task,
            summary="Diff could not be safely applied.",
            error=str(exc),
        )
        memory.record_mistake(f"Task '{planned.task}' produced an unsafe/invalid diff: {exc}")
        memory.add_run(task=planned.task, summary=report.summary, files_changed=[], outcome="failed")
        save_memory(memory, memory_path)
        return report

    # -- BUILD + TEST (with bounded debugger retry loop) --------------
    build_result = run_build(config, REPO_WORKDIR)
    test_result = run_tests(config, REPO_WORKDIR) if build_result.passed else build_result

    debug_attempts = 0
    while not test_result.passed and debug_attempts < config.limits.max_debugger_retries:
        debug_attempts += 1
        logger.info("Tests failing, debugger attempt %s", debug_attempts)
        debug_output = debugger.debug(
            config, llm, REPO_WORKDIR, planned, test_result, debug_attempts
        )
        if debug_output.no_fix_possible or not debug_output.diff_text.strip():
            logger.info("Debugger could not produce a fix: %s", debug_output.reason)
            break
        try:
            git_ops.apply_diff(debug_output.diff_text)
        except (ProtectedPathError, GitOperationError) as exc:
            logger.warning("Debugger diff rejected: %s", exc)
            break

        build_result = run_build(config, REPO_WORKDIR)
        test_result = run_tests(config, REPO_WORKDIR) if build_result.passed else build_result

    if not test_result.passed:
        git_ops.discard_changes()
        report = CycleReport(
            outcome="failed",
            task=planned.task,
            summary=f"Tests failed after {debug_attempts} debugger attempt(s); no commit made.",
            tests_passed=False,
            error=test_result.stderr[:1500],
        )
        memory.record_mistake(
            f"Task '{planned.task}' could not pass tests after {debug_attempts} debug attempts."
        )
        memory.add_run(task=planned.task, summary=report.summary, files_changed=[], outcome="failed")
        save_memory(memory, memory_path)
        return report

    # -- SECURITY AUDIT (advisory but blocks on hard secret matches) --
    audit_result = security_auditor.audit(llm, diff_text)
    if audit_result.hardcoded_secret_detected:
        git_ops.discard_changes()
        report = CycleReport(
            outcome="failed",
            task=planned.task,
            summary="Diff appears to contain a hardcoded secret/credential; aborted before commit.",
            error="; ".join(audit_result.secret_matches),
        )
        memory.record_mistake(f"Task '{planned.task}' attempted to introduce a hardcoded secret.")
        memory.add_run(task=planned.task, summary=report.summary, files_changed=[], outcome="failed")
        save_memory(memory, memory_path)
        return report

    # -- DOCS + MEMORY UPDATE -----------------------------------------
    doc_output = doc_writer.write_docs(llm, planned, diff_text)
    doc_writer.append_changelog(REPO_WORKDIR, doc_output.changelog_entry)

    memory.record_completed_feature(doc_output.changelog_entry)
    memory.add_run(
        task=planned.task,
        summary=doc_output.changelog_entry,
        files_changed=applied.files_changed,
        outcome="merged_pr_opened",
    )
    save_memory(memory, memory_path)

    # -- COMMIT, PUSH, OPEN PR -----------------------------------------
    commit_message = f"agent: {planned.task}"
    git_ops.commit_all(commit_message)
    git_ops.push_branch(branch_name)

    needs_human_review = git_ops.diff_touches_schema(applied.files_changed)
    pr_body_parts = [
        doc_output.pr_description,
        "",
        f"**Lines changed:** +{applied.lines_added} -{applied.lines_removed}",
        f"**Tests:** passing (`{config.testing.test_command}`)",
    ]
    if audit_result.llm_issues:
        pr_body_parts.append(f"**Security auditor notes ({audit_result.llm_severity}):** "
                              + "; ".join(audit_result.llm_issues))
    if needs_human_review:
        pr_body_parts.append("\n⚠️ This change touches schema/migration files and requires human review.")

    pr_url = None
    if config.git.open_pr:
        pr_url = git_ops.open_pull_request(
            branch_name=branch_name,
            title=f"[AI Engineer] {planned.task}"[:120],
            body="\n".join(pr_body_parts),
            needs_human_review=needs_human_review,
        )

    return CycleReport(
        outcome="pr_opened" if pr_url else "completed_no_pr",
        task=planned.task,
        files_changed=applied.files_changed,
        tests_passed=True,
        pr_url=pr_url,
        summary=doc_output.pr_description,
        remaining_tasks=[],
        suggested_priorities=[i["title"] for i in open_issues[:3]],
    )


def run_and_report(config: AgentConfig) -> int:
    """Top-level entrypoint: runs one cycle, always reports, never raises
    past this point — a crash gets reported, not silently swallowed by CI.
    """
    start = time.time()
    try:
        report = run_cycle(config)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Cycle crashed")
        report = CycleReport(
            outcome="failed",
            task="(crashed before/during planning)",
            summary="The agent cycle raised an unhandled exception.",
            error=str(exc),
        )

    elapsed = time.time() - start
    report.summary = (report.summary or "") + f"\n\n(cycle duration: {elapsed:.1f}s)"
    dispatch_report(config.reporting, report, dict(os.environ))

    return 0 if report.outcome in ("pr_opened", "no_op", "completed_no_pr") else 1
