# /// script
# dependencies = ["pydantic", "python-dotenv", "pyyaml", "rich"]
# ///
"""REA workflow tests: optional investigation, approval binding, handoff flow.

All agent turns are simulated (agent_pi.run is mocked) and REA findings come
from canned fixtures — no provider, no network, no real REA install. A
separate live check (not part of this suite) runs the real CLI against a
fixture target.
"""
import json
import io
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace

import adw_plan
import adw_plan_build_test
import adw_simple_sdlc_rea
import adw_rea_plan
import adw_verify_sdlc
from adw_modules import agent_pi, agents, gates, session
from adw_modules import rea as rea_cli
from adw_modules.data_types import PiResult, ReaOutput

SOURCE = Path(__file__).parent.resolve()
REA_MARKER = "REAFINDING-trace-entry-point"


def rea_envelope(*, status="success"):
    return {
        "status": status,
        "summary": "simulated REA investigation",
        "artifacts": [],
        "question": "How does feature X work?",
        "target": "example/app",
        "scope": "read-only inspection of the named target",
        "permitted_actions": "static REA CLI inspection only",
        "observed_facts": [
            {"observation": REA_MARKER, "evidence": "analyze: modules/main.js:12"},
        ],
        "inferences": [
            {"claim": "entry point delegates to handler", "evidence": REA_MARKER},
        ],
        "unknowns": ["native fast path not examined (no engine)"],
        "limitations": ["static analysis only; no runtime observation"],
        "behavioral_requirements": ["preserve the existing call order"],
        "validation_cases": ["invoke entry with X, observe Y"],
    }


class ReaWorkflowTests(unittest.TestCase):
    def exercise(self, workflow_main, mode="ok", adw_id="rea12345"):
        """Run an ADW with simulated agents. mode controls the rea fake:
        ok | missing | raise. Returns (exit_code, commits_after_baseline, phases)."""
        temp = tempfile.TemporaryDirectory(prefix="crew-rea-")
        root = Path(temp.name)
        run_holder = []
        ensure = session.ensure
        previous = Path.cwd()

        def capture(*args, **kwargs):
            run = ensure(*args, **kwargs)
            run_holder.append(run)
            return run

        try:
            shutil.copytree(SOURCE, root / "adws",
                            ignore=shutil.ignore_patterns("sessions", "*.db*", "__pycache__", "studio_history.json"))
            (root / ".gitignore").write_text("adws/adw_data/sessions/\n*.db*\n__pycache__/\n")
            (root / ".crew-quality.json").write_text(json.dumps({"test": ["node", "--test"], "lint": ["node", "--check", "app.js"], "typecheck": ["node", "--check", "app.js"], "build": ["node", "--check", "app.js"]}))
            os.chdir(root)
            for args in [["init", "-q"], ["config", "user.name", "Test"], ["config", "user.email", "test@localhost"], ["add", "."], ["commit", "-qm", "baseline"]]:
                subprocess.run(["git", *args], check=True, capture_output=True)
            baseline = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
            if workflow_main is adw_verify_sdlc:
                (root / "operator-notes.md").write_text("Preserve this pre-existing uncommitted note.")

            assignment_for_fake = {}
            def fake(request, **kwargs):
                role = request.session_id.split("-")[2]
                if role == "rea":
                    if '"evidence_path"' not in request.prompt:
                        raise AssertionError("REA interpreter never received deterministic evidence")
                    if mode == "raise":
                        kwargs["on_event"]({"type": "tool_execution_end", "toolName": "bash", "toolCallId": "x", "result": {"content": []}})
                        raise RuntimeError("simulated interruption during investigation")
                    if mode == "missing":
                        return PiResult(text=json.dumps({
                            **rea_envelope(status="fail"),
                            "summary": "rea-agents CLI unavailable: npx failed with ENOENT",
                        }), session_id=request.session_id)
                    adw_id = request.session_id.split("-")[1]
                    handoff_dir = root / "adws" / "adw_data" / "sessions" / adw_id / "context_handoff"
                    handoff_dir.mkdir(parents=True, exist_ok=True)
                    envelope = rea_envelope()
                    envelope.update(assignment_for_fake)
                    if mode == "scope-change":
                        envelope["target"] = "unapproved-target"
                    if mode == "tamper":
                        (handoff_dir / "rea_evidence.json").write_text('{"evidence_id":"changed"}')
                    envelope["artifacts"] = []  # engine persists the validated typed handoff
                    return PiResult(text=json.dumps(envelope), session_id=request.session_id)
                envelope = {"status": "success", "summary": "simulated " + role, "artifacts": []}
                if role == "planner":
                    if REA_MARKER not in request.prompt and workflow_main in (adw_simple_sdlc_rea, adw_rea_plan):
                        raise AssertionError("planner never received the REA handoff")
                    text = "A testable demo informed by REA; see rea_handoff.md for evidence and proposed validation."
                    if workflow_main in (adw_simple_sdlc_rea, adw_rea_plan):
                        envelope.update(plan_markdown=text, commit_message="Record plan")
                    else:
                        (root / "specs").mkdir(exist_ok=True)
                        file = root / "specs/plan.md"
                        file.write_text(text)
                        envelope.update(artifacts=[str(file)], commit_message="Record plan")
                elif role == "builder":
                    (root / "test").mkdir(exist_ok=True)
                    (root / "app.js").write_text("module.exports = {ok:true};\n")
                    (root / "test/app.test.js").write_text("const test=require('node:test'); const assert=require('node:assert/strict'); test('behavior',()=>assert.equal(require('../app').ok,true));\n")
                    envelope.update(changed_files=["app.js", "test/app.test.js"], commit_message="Build demo")
                elif role == "reviewer":
                    envelope.update(approved=True, findings=[{"requirement": "demo behavior", "met": True, "evidence": "app.js inspected"}], blocking=[])
                elif role == "documenter":
                    if workflow_main is adw_verify_sdlc:
                        diffs = list((root / "adws/adw_data/sessions").glob("*/context_handoff/changes.diff"))
                        diff = diffs[0].read_text()
                        if "operator-notes.md" in diff or "app.js" not in diff:
                            raise AssertionError("noncommitting documentation mixed pre-existing work with this run")
                    (root / "app_docs").mkdir(exist_ok=True)
                    file = root / "app_docs/usage.md"
                    file.write_text("Run node --test to check the demo.")
                    envelope.update(artifacts=[str(file)], document_path="app_docs/usage.md", commit_message="Document demo")
                return PiResult(text=json.dumps(envelope), session_id=request.session_id)

            code = None
            error = None
            def collect(target, out_dir):
                if mode == "cli-fail":
                    raise rea_cli.ReaFailed("simulated CLI exit 2: invalid argument")
                path = Path(out_dir) / "rea_evidence.json"
                path.write_text(json.dumps({"evidence_id": "mock-evidence"}))
                return rea_cli.ReaResult(ok=True, target=target, kind="javascript", command=["<mock CLI>"], evidence_path=str(path))

            with patch.object(agent_pi, "run", fake), \
                    patch.object(rea_cli, "run_investigation", collect), \
                    patch.object(agent_pi, "resolve_model", return_value=("mock", "auto")), \
                    patch.object(session, "ensure", capture):
                try:
                    assignment = {k: rea_envelope()[k] for k in ("question", "target", "scope", "permitted_actions")}
                    assignment.update(target=str(root), permitted_actions="static-local")
                    # Preserve the exact approved scope in the simulated handoff.
                    assignment_for_fake.update(assignment)
                    code = workflow_main.main("Investigate the demo, then build it\n```crew-rea\n" + json.dumps(assignment) + "\n```", adw_id=adw_id)
                except Exception as e:  # noqa: BLE001 - the harness must fail loudly
                    error = e
            commits = int(subprocess.check_output(["git", "rev-list", "--count", baseline + "..HEAD"], text=True))
            phases = [p.params.name for run in run_holder for p in run.phases] if run_holder else []
            statuses = {}
            if run_holder:
                import sqlite3
                conn = sqlite3.connect(root / "adws" / "adw_data" / "sssf.db")
                try:
                    row = conn.execute("SELECT status FROM sessions WHERE adw_id=?", (adw_id,)).fetchone()
                    statuses["session"] = row[0] if row else None
                finally:
                    conn.close()
            return code, commits, phases, statuses, error
        finally:
            for run in run_holder:
                run.tracer.conn.close()
            os.chdir(previous)
            temp.cleanup()

    def test_ordinary_workflow_skips_rea(self):
        code, commits, phases, statuses, error = self.exercise(adw_plan_build_test)
        self.assertIsNone(error)
        self.assertEqual(code, 0)
        self.assertNotIn("rea", phases)

    def test_investigate_plan_stops_before_any_commit_or_build(self):
        code, commits, phases, statuses, error = self.exercise(adw_rea_plan)
        self.assertIsNone(error)
        self.assertEqual(code, 0)
        self.assertEqual(commits, 0)
        self.assertEqual(phases, ["request", "rea_collect", "rea", "plan"])

    def test_noncommitting_sdlc_keeps_acceptance_checks(self):
        code, commits, phases, statuses, error = self.exercise(adw_verify_sdlc)
        self.assertIsNone(error)
        self.assertEqual(code, 0)
        self.assertEqual(commits, 0)
        for name in ("plan", "build", "test_1", "review_1", "changes", "document"):
            self.assertIn(name, phases)

    def test_plan_only_has_no_rea_step(self):
        code, commits, phases, statuses, error = self.exercise(adw_plan, adw_id="plan0rea1")
        self.assertIsNone(error)
        self.assertEqual(code, 0)
        self.assertEqual(phases, ["request", "plan"])

    def test_rea_required_in_roster(self):
        from adw_modules import agents as agents_mod
        with patch.object(agent_pi, "resolve_model", return_value=("mock", "auto")):
            cfg = agents_mod.load_config(str(SOURCE / "adw_sssf_config" / "sssf.config.yaml"))
            cfg.agents = [a for a in cfg.agents if a.name != "rea"]
            with self.assertRaises(SystemExit):
                agents_mod.validate(cfg, ["rea", "planner", "builder", "reviewer", "documenter"])

    def test_handoff_flows_to_planner_and_full_chain_succeeds(self):
        code, commits, phases, statuses, error = self.exercise(adw_simple_sdlc_rea)
        self.assertIsNone(error, f"unexpected harness error: {error!r}")
        self.assertEqual(code, 0)
        self.assertEqual(phases[1], "rea_collect")
        self.assertEqual(phases[2], "rea")
        self.assertEqual(phases[3], "plan")
        self.assertEqual(commits, 3)  # plan, build, docs
        self.assertEqual(statuses.get("session"), "success")

    def test_missing_rea_fails_cleanly_without_commit(self):
        code, commits, phases, statuses, error = self.exercise(adw_simple_sdlc_rea, mode="missing")
        self.assertIsNotNone(error)  # execute() rejects status != success
        self.assertEqual(commits, 0)
        self.assertEqual(statuses.get("session"), "fail")

    def test_interrupted_rea_fails_without_commit(self):
        code, commits, phases, statuses, error = self.exercise(adw_simple_sdlc_rea, mode="raise")
        self.assertIsNotNone(error)
        self.assertEqual(commits, 0)
        self.assertEqual(statuses.get("session"), "fail")

    def test_cli_failure_stops_before_agents_or_commits(self):
        code, commits, phases, statuses, error = self.exercise(adw_simple_sdlc_rea, mode="cli-fail")
        self.assertIsInstance(error, rea_cli.ReaFailed)
        self.assertEqual(commits, 0)
        self.assertEqual(phases, ["request", "rea_collect"])
        self.assertEqual(statuses.get("session"), "fail")

    def test_scope_change_or_raw_evidence_tampering_stops_planning(self):
        for mode in ("scope-change", "tamper"):
            with self.subTest(mode=mode):
                code, commits, phases, statuses, error = self.exercise(adw_simple_sdlc_rea, mode=mode)
                self.assertIsNotNone(error)
                self.assertEqual(commits, 0)
                self.assertNotIn("plan", phases)
                self.assertEqual(statuses.get("session"), "fail")


class ReaGateTests(unittest.TestCase):
    def test_complete_handoff_passes(self):
        from adw_modules.data_types import ReaOutput
        from adw_modules import gates
        env = ReaOutput(**rea_envelope())
        report = gates.rea_handoff_complete(env, None)
        self.assertEqual(report.violations, [])

    def test_empty_facts_fail(self):
        from adw_modules.data_types import ReaOutput
        from adw_modules import gates
        data = rea_envelope()
        data["observed_facts"] = []
        env = ReaOutput(**data)
        report = gates.rea_handoff_complete(env, None)
        self.assertTrue(any("facts" in v for v in report.violations))

    def test_inference_without_evidence_fails(self):
        from adw_modules.data_types import ReaOutput
        from adw_modules import gates
        data = rea_envelope()
        data["inferences"] = [{"claim": "it works by magic", "evidence": ""}]
        env = ReaOutput(**data)
        report = gates.rea_handoff_complete(env, None)
        self.assertTrue(any("evidence" in v for v in report.violations))

    def test_fact_without_evidence_fails(self):
        from adw_modules.data_types import ReaOutput
        from adw_modules import gates
        data = rea_envelope()
        data["observed_facts"] = [{"observation": "something", "evidence": ""}]
        env = ReaOutput(**data)
        report = gates.rea_handoff_complete(env, None)
        self.assertTrue(any("evidence" in v for v in report.violations))


class ReaCollectionTests(unittest.TestCase):
    def test_run_cap_reads_persisted_cumulative_usage(self):
        import sqlite3
        from adw_modules.runner import Run
        conn = sqlite3.connect(":memory:")
        try:
            conn.execute("CREATE TABLE events(adw_id TEXT,type TEXT,tokens INTEGER)")
            conn.executemany("INSERT INTO events VALUES(?,?,?)", [("test", "usage", 60), ("test", "usage", 45), ("other", "usage", 1000), ("test", "agent_end", 105)])
            run = Run.__new__(Run)
            run.adw_id = "test"
            run.tracer = SimpleNamespace(conn=conn)
            with patch.dict(os.environ, {"CREW_TOKEN_CAP": "100"}):
                with self.assertRaisesRegex(RuntimeError, "105 / 100"):
                    run.check_token_cap()
            with patch.dict(os.environ, {"CREW_TOKEN_CAP": "106"}):
                run.check_token_cap()
        finally:
            conn.close()

    def test_large_prompt_transport_and_provider_error_are_bounded(self):
        from adw_modules.data_types import PiRequest
        event = {"type": "message_end", "message": {"role": "assistant", "stopReason": "error", "errorMessage": "400 invalid parameters sk-privatevalue", "content": []}}
        process = SimpleNamespace(stdout=io.StringIO(json.dumps(event) + "\n"), stderr=io.StringIO(""), wait=lambda: 0, pid=999)
        captured = []
        def launch(argv, **kwargs):
            captured.extend(argv)
            return process
        with tempfile.TemporaryDirectory() as tmp, patch.object(agent_pi, "_pi_command", return_value=["pi"]), patch.object(agent_pi, "resolve_model", return_value=("mock", "auto")), patch.object(agent_pi, "context_window", return_value=128000), patch.object(agent_pi.subprocess, "Popen", launch):
            request = PiRequest(prompt="x" * 40000, system_prompt="system", model="mock/auto", thinking="off", session_id="test", session_dir=tmp, raw_output_path=str(Path(tmp) / "raw.jsonl"), cwd=tmp)
            with self.assertRaisesRegex(RuntimeError, "invalid parameters") as error:
                agent_pi.run(request)
            self.assertNotIn("sk-privatevalue", str(error.exception))
            self.assertLess(sum(len(x) for x in captured), 10000)
            self.assertEqual(Path(captured[-1][1:]).read_text(), request.prompt)

    def test_scope_required_and_remote_or_execution_rejected(self):
        for prompt in ("no assignment", '```crew-rea\n{}\n```',
                       '```crew-rea\n{"question":"q","target":"https://example.com","scope":"s","permitted_actions":"execute"}\n```'):
            with self.assertRaises(rea_cli.ReaError):
                rea_cli.approved_assignment(prompt)

    def test_cli_failures_are_not_evidence(self):
        cases = [subprocess.CompletedProcess([], 2, "", "invalid argument"),
                 subprocess.CompletedProcess([], 0, "not json", ""),
                 subprocess.CompletedProcess([], 0, '{"evidence_id":"incomplete"}', ""),
                 subprocess.CompletedProcess([], 0, '{}', "")]
        with tempfile.TemporaryDirectory() as tmp, patch.object(rea_cli, "_npx_prefix", return_value=["npx", "rea"]):
            for result in cases:
                with self.assertRaises(rea_cli.ReaFailed):
                    rea_cli.run_investigation(tmp, tmp, runner=lambda *a, **k: result)
                self.assertFalse((Path(tmp) / "rea_evidence.json").exists())

    def test_timeout_and_missing_cli(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(rea_cli, "_npx_prefix", return_value=["npx", "rea"]):
            with self.assertRaisesRegex(rea_cli.ReaFailed, "timed out"):
                rea_cli.run_investigation(tmp, tmp, runner=lambda *a, **k: (_ for _ in ()).throw(subprocess.TimeoutExpired("rea", 1)))
            with self.assertRaises(rea_cli.ReaUnavailable):
                rea_cli.run_investigation(tmp, tmp, runner=lambda *a, **k: (_ for _ in ()).throw(FileNotFoundError()))

    def test_failure_records_both_streams_and_redacts_secrets(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(rea_cli, "_npx_prefix", return_value=["npx", "rea"]):
            result = subprocess.CompletedProcess([], 2, 'specific failure api_key=privatevalue', 'progress only')
            with self.assertRaisesRegex(rea_cli.ReaFailed, "specific failure"):
                rea_cli.run_investigation(tmp, tmp, runner=lambda *a, **k: result)
            diagnostic = (Path(tmp) / "rea_diagnostic.json").read_text()
            self.assertIn("progress only", diagnostic)
            self.assertIn("specific failure", diagnostic)
            self.assertNotIn("privatevalue", diagnostic)

    def test_environment_fixture_cannot_replace_real_collection(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {"REA_FIXTURE_DIR": tmp}), patch.object(rea_cli, "_npx_prefix", return_value=["npx", "rea"]):
            calls = []
            def runner(argv, **kwargs):
                calls.append(argv)
                return subprocess.CompletedProcess(argv, 0, '{"evidence_id":"test","operation":"analyze_javascript_application","normalized_result":{"graph":{}}}', '')
            result = rea_cli.run_investigation(tmp, tmp, runner=runner)
            self.assertTrue(calls)
            self.assertTrue(Path(result.evidence_path).is_file())


if __name__ == "__main__":
    unittest.main()
