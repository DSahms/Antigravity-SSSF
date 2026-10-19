# /// script
# dependencies = ["pydantic", "python-dotenv", "pyyaml", "rich"]
# ///
"""Real coordinator and Git/check execution with simulated agent responses, no provider use."""
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import adw_simple_sdlc
from adw_modules import agent_pi, session, permissions
from adw_modules.data_types import PiResult


class WorkflowTests(unittest.TestCase):
    def exercise(self, passing, violate=False):
        source = Path(__file__).parent.resolve()
        previous = Path.cwd()
        temp = tempfile.TemporaryDirectory(prefix="crew-workflow-")
        root = Path(temp.name)
        run_holder = []
        ensure = session.ensure
        def capture(*args, **kwargs):
            run = ensure(*args, **kwargs)
            run_holder.append(run)
            return run
        try:
            shutil.copytree(source, root / "adws", ignore=shutil.ignore_patterns("sessions", "*.db*", "__pycache__", "studio_history.json"))
            (root / ".gitignore").write_text("adws/adw_data/sessions/\n*.db*\n__pycache__/\n")
            (root / ".crew-quality.json").write_text(json.dumps({"test": ["node", "--test"], "lint": ["node", "--check", "app.js"], "typecheck": ["node", "--check", "app.js"], "build": ["node", "--check", "app.js"]}))
            os.chdir(root)
            for args in [["init", "-q"], ["config", "user.name", "Test"], ["config", "user.email", "test@localhost"], ["add", "."], ["commit", "-qm", "baseline"]]:
                subprocess.run(["git", *args], check=True, capture_output=True)
            baseline = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
            def fake(request, **kwargs):
                role = request.session_id.split("-")[2]
                envelope = {"status": "success", "summary": "simulated " + role, "artifacts": []}
                if role == "planner":
                    if violate:
                        (root / "app.js").write_text("unauthorized implementation")
                        kwargs["on_event"]({"type": "tool_execution_end", "toolName": "write", "toolCallId": "breach", "result": {"content": []}})
                        raise AssertionError("Permission breach did not stop the agent turn")
                    (root / "specs").mkdir(exist_ok=True)
                    file = root / "specs/plan.md"
                    file.write_text("A testable demo")
                    envelope.update(artifacts=[str(file)], commit_message="Record plan")
                elif role == "builder":
                    (root / "test").mkdir(exist_ok=True)
                    (root / "app.js").write_text("module.exports = {ok:true};\n")
                    (root / "test/app.test.js").write_text("const test=require('node:test'); const assert=require('node:assert/strict'); test('behavior',()=>assert.equal(require('../app').ok," + ("true" if passing else "false") + "));\n")
                    envelope.update(changed_files=["app.js", "test/app.test.js"], commit_message="Build demo")
                elif role == "reviewer":
                    envelope.update(approved=True, findings=[{"requirement": "demo behavior", "met": True, "evidence": "app.js and test/app.test.js inspected in this simulated review"}], blocking=[])
                elif role == "documenter":
                    (root / "app_docs").mkdir(exist_ok=True)
                    file = root / "app_docs/usage.md"
                    file.write_text("Run node --test to check the demo.")
                    envelope.update(artifacts=[str(file)], document_path="app_docs/usage.md", commit_message="Document demo")
                return PiResult(text=json.dumps(envelope), session_id=request.session_id)
            with patch.object(agent_pi, "run", fake), patch.object(agent_pi, "resolve_model", return_value=("mock", "auto")), patch.object(session, "ensure", capture):
                code = adw_simple_sdlc.main("Build a demo", adw_id="1234abcd")
            commits = int(subprocess.check_output(["git", "rev-list", "--count", baseline + "..HEAD"], text=True))
            return code, commits, (root / "app_docs/usage.md").exists()
        finally:
            for run in run_holder:
                run.tracer.conn.close()
            os.chdir(previous)
            temp.cleanup()

    def test_verified_work_is_committed_and_documented(self):
        self.assertEqual(self.exercise(True), (0, 3, True))

    def test_red_suite_prevents_code_commit_and_documentation(self):
        self.assertEqual(self.exercise(False), (1, 1, False))

    def test_planner_cannot_continue_after_implementation_write(self):
        with self.assertRaises(permissions.PermissionBreach):
            self.exercise(True, violate=True)


if __name__ == "__main__":
    unittest.main()
