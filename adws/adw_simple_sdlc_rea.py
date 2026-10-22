#!/usr/bin/env -S uv run
# /// script
# dependencies = ["pydantic", "python-dotenv", "pyyaml", "rich"]
# ///
"""ADW Simple SDLC + REA — investigate first, then plan, build, test, review, document.

Usage:
    uv run adws/adw_simple_sdlc_rea.py "<prompt or path/to/prompt.md>" [--config adws/adw_sssf_config/sssf.config.yaml] [--adw-id a1b2c3d4]

Phases: engineer(request) -> rea(investigate) -> planner -> git(commit_plan)
        -> builder -> code(test) [-> builder(fix) -> code(test) ... bounded]
        -> reviewer [-> builder(revise) -> reviewer ... bounded]
        -> code(retest, only if a revision changed code)
        -> git(commit_build) -> code(changes) -> documenter -> git(commit_docs)

The REA phase runs BEFORE planning because the plan depends on its handoff:
the planner receives the REA envelope as its previous context, and the plan
must cite the investigation's behavioral requirements and validation cases.

Plan Only (adw_plan.py) never runs this workflow: planning alone only
*describes* a proposed investigation, it never executes one.

The REA agent is read-only with respect to the codebase (writes: specs/ for its own handoff copy only). It inspects the assigned target with
the REA CLI, writes its handoff to context_handoff/rea_handoff.md plus a
specs/ copy, and reports a typed ReaOutput. A missing engine, a missing
target, or an incomplete investigation fails the phase loudly — an unfinished
investigation never looks like verified findings.
"""

import argparse
import sys
from pathlib import Path

from adw_modules import agents, changes, gates, git_helper, quality, session, utils
from adw_modules import rea as rea_cli
from adw_modules.data_types import (AgentCall, BuildOutput, ChangeCapture,
                                    DocumentOutput, PhaseParams, PlanOutput,
                                    ReaOutput, ReviewOutput, EvidencePlanOutput)

REQUIRED_AGENTS = ["rea", "planner", "builder", "reviewer", "documenter"]
MAX_FIX_LOOPS = 3
MAX_REVISION_LOOPS = 2

DOCUMENT_NOTES = ("Read diff_path in full before writing. Document only what the "
                  "diff shows, then copy the write-up into app_docs/ as your task "
                  "describes.")


def main(prompt: str, config: str = "adws/adw_sssf_config/sssf.config.yaml", adw_id: str | None = None, *, stop_after_plan: bool = False) -> int:
    cfg = agents.load_config(config)
    agents.validate(cfg, ["rea", "planner"] if stop_after_plan else REQUIRED_AGENTS)
    # Evidence-based planning has all its authorized inputs in the handoff.
    # Keep interpretation separate from deterministic file persistence.
    planner = next(a for a in cfg.agents if a.name == "planner")
    planner.prompt_engineering.system = "adws/adw_data/prompt_engineering/evidence_planner/system.md"
    planner.prompt_engineering.user = "adws/adw_data/prompt_engineering/evidence_planner/user.md"
    planner.tools = []
    planner.writes = []
    run = session.ensure(cfg, adw_id)
    baseline = git_helper.rev("HEAD")     # pinned before this run commits anything

    def commit(ph, envelope) -> None:
        """Commit what the preceding phase produced, in that agent's own words."""
        message = envelope.commit_message or f"sssf({run.adw_id}): {envelope.summary}"
        ph.log(sha=git_helper.commit_all(message), message=message)

    def record(ph, result) -> None:
        """Log a deterministic block's verdict — the same shape every ADW uses."""
        passed = sum(1 for check in result.checks if check.passed)
        ph.log(passed=result.passed, checks=f"{passed}/{len(result.checks)}",
               artifacts=", ".join(result.artifacts))

    with run.phase(PhaseParams(name="request", kind="engineer", owner=run.engineer,
                               description="Capture the incoming ask")) as ph:
        ph.log(input=prompt, baseline=git_helper.short_sha(baseline))

    with run.phase(PhaseParams(name="rea_collect", kind="code", owner="rea-cli",
                               description="Collect real static evidence within the approved investigation assignment")) as ph:
        assignment = rea_cli.approved_assignment(prompt)
        result = rea_cli.run_investigation(assignment["target"], str(run.context_handoff_dir))
        evidence = rea_cli.as_envelope(result, assignment["question"], assignment["scope"], assignment["permitted_actions"])
        ph.log(command=result.command, evidence=result.evidence_path)

    with run.phase(PhaseParams(name="rea", kind="agent", owner="rea",
                               description="Investigate the assigned existing software and hand over evidence-backed findings")) as ph:
        context = Path(evidence.context_path).read_text(encoding="utf-8")
        rea = ph.call(AgentCall(output_type=ReaOutput, prompt=prompt + "\n\n## Engine evidence projection\n" + context, previous=evidence,
                                gates=[gates.rea_handoff_complete,
                                       rea_cli.interpretation_matches(assignment, result)]))
        rea = rea_cli.persist_handoff(rea, run)
        report = rea_cli.handoff_matches(assignment, result)(rea, run)
        if report.violations:
            raise RuntimeError("REA handoff persistence failed: " + "; ".join(report.violations))
        run.tracer.gate_row(ph.phase, "rea_persisted_handoff", report, 1)
        run.tracer.envelope_row(ph.phase, "rea", "ReaOutput", rea.model_dump_json(), True, 1)
        ph.log(handoff=rea.artifacts)

    with run.phase(PhaseParams(name="plan", kind="agent", owner="planner", retries=1,
                               description="Turn the request and the REA handoff into an implementable plan")) as ph:
        immutable_handoff = {p: Path(p).read_bytes() for p in rea.artifacts}
        plan = ph.call(AgentCall(output_type=EvidencePlanOutput, prompt=prompt, previous=rea,
                                 gates=[rea_cli.plan_consumes_evidence(assignment, result)]))
        if any(Path(p).read_bytes() != data for p, data in immutable_handoff.items()):
            raise RuntimeError("Planner changed the immutable REA handoff")
        plan = rea_cli.persist_plan(plan, run)
        run.tracer.envelope_row(ph.phase, "planner", "EvidencePlanOutput", plan.model_dump_json(), True, 1)
        ph.log(plan=plan.artifacts)

    if stop_after_plan:
        return run.finish()

    with run.phase(PhaseParams(name="commit_plan", kind="code", owner="git",
                               description="Put the spec and the REA handoff on record before any code exists to blur them")) as ph:
        commit(ph, plan)

    with run.phase(PhaseParams(name="build", kind="agent", owner="builder",
                               description="Implement the plan exactly, honoring the REA behavioral requirements")) as ph:
        build = ph.call(AgentCall(output_type=BuildOutput, prompt=prompt, previous=plan,
                                  gates=[gates.diff_matches_claims]))

    test = None
    for i in range(1, MAX_FIX_LOOPS + 1):
        with run.phase(PhaseParams(name=f"test_{i}", kind="code", owner="quality",
                                   description="Run the suite — a known command, so no agent has to rediscover it")) as ph:
            test = quality.run_tests(run)
            record(ph, test)

        if test.passed:
            break

        with run.phase(PhaseParams(name=f"fix_{i}", kind="agent", owner="builder", retries=1,
                                   description="Repair what the suite reported, from its "
                                               "verbatim output")) as ph:
            build = ph.call(AgentCall(output_type=BuildOutput, prompt=prompt,
                                      previous=quality.as_envelope(test, "tests"),
                                      gates=[gates.diff_matches_claims]))

    review = None
    revised = False
    for i in range(1, MAX_REVISION_LOOPS + 1):
        with run.phase(PhaseParams(name=f"review_{i}", kind="agent", owner="reviewer",
                                   description="Confirm the build matches the plan and the REA findings")) as ph:
            review = ph.call(AgentCall(output_type=ReviewOutput, prompt=prompt, previous=build,
                                       gates=[gates.artifacts_exist, gates.verdict_consistent]))

        if review.approved or i == MAX_REVISION_LOOPS:
            break

        with run.phase(PhaseParams(name=f"revise_{i}", kind="agent", owner="builder", retries=1,
                                   description="Close the reviewer's blocking findings")) as ph:
            build = ph.call(AgentCall(output_type=BuildOutput, prompt=prompt, previous=review,
                                      gates=[gates.diff_matches_claims]))
            revised = True

    # A revision edited code after the suite last ran, so the green light is
    # stale. Re-run it rather than commit on a result that predates the change.
    if revised and review is not None and review.approved:
        with run.phase(PhaseParams(name="retest", kind="code", owner="quality",
                                   description="Re-run the suite — the revision changed code "
                                               "after the last green result")) as ph:
            test = quality.run_tests(run)
            record(ph, test)

    # Red tests or a rejected review stop the chain here: the code stays
    # uncommitted and nothing is documented, because there is nothing worth
    # describing yet. The plan commit stands — the spec and the REA handoff
    # are records of what was asked and what was found.
    verified = (test is not None and test.passed
                and review is not None and review.approved)
    if verified:
        with run.phase(PhaseParams(name="commit_build", kind="code", owner="git",
                                   description="Land the code only now: green suite, approved review")) as ph:
            commit(ph, build)

        with run.phase(PhaseParams(name="changes", kind="code", owner="git",
                                   description="Diff the whole run against its pinned baseline, for the documenter")) as ph:
            changeset = changes.capture(run, ChangeCapture(base=baseline))
            ph.log(base=f"{changeset.base.label} @ {changeset.base.commit[:7]}",
                   reason=changeset.base.reason,
                   files=len(changeset.files) + len(changeset.untracked),
                   lines=f"+{changeset.insertions} -{changeset.deletions}",
                   diff=changeset.diff_path)
            if changeset.empty:
                raise RuntimeError(
                    f"nothing changed since {changeset.base.label} "
                    f"({changeset.base.reason}) — there is nothing to document.")

        with run.phase(PhaseParams(name="document", kind="agent", owner="documenter", retries=1,
                                   description="Write up the completed change")) as ph:
            document = ph.call(AgentCall(output_type=DocumentOutput, prompt=prompt,
                                         previous=changes.as_envelope(changeset, DOCUMENT_NOTES),
                                         gates=[gates.artifacts_exist, gates.files_non_empty]))

        with run.phase(PhaseParams(name="commit_docs", kind="code", owner="git",
                                   description="Ship the write-up in its own commit, beside the code it describes")) as ph:
            commit(ph, document)

    return run.finish(accepted=verified,
                      reason="the suite or the review never came back clean")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("prompt", help="inline text or a path to a prompt file")
    parser.add_argument("--config", default="adws/adw_sssf_config/sssf.config.yaml")
    parser.add_argument("--adw-id", default=None, help="join or pin an existing session")
    args = parser.parse_args()
    sys.exit(main(utils.resolve_prompt(args.prompt), args.config, args.adw_id))
