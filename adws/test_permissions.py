# /// script
# dependencies = ["pydantic", "pyyaml", "python-dotenv"]
# ///
"""Regression checks for content-aware permission enforcement, using isolated repositories."""
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from adw_modules import permissions
from adw_modules.data_types import AgentConfig, SSSFConfig


class PermissionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="crew-permissions-")
        self.root = Path(self.temp.name)
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        self.file = self.root / "protected.txt"
        self.file.write_text("initial\n")
        subprocess.run(["git", "add", "."], cwd=self.root, check=True)
        self.run = SimpleNamespace(repo_root=self.root, cfg=SSSFConfig())
        self.agent = AgentConfig(name="scout", purpose="test", writes=[], prompt_engineering={"system": "x", "user": "y"})

    def tearDown(self):
        self.temp.cleanup()

    def test_same_line_counts_restore_operator_content(self):
        self.file.write_text("operator edit\n")
        before = permissions.snapshot(self.run)
        self.file.write_text("agent rewrite\n")
        with self.assertRaises(permissions.PermissionBreach):
            permissions.enforce(self.run, None, self.agent, before)
        self.assertEqual(self.file.read_text(), "operator edit\n")

    def test_existing_untracked_rewrite_is_detected(self):
        file = self.root / "notes.txt"
        file.write_text("operator notes")
        before = permissions.snapshot(self.run)
        file.write_text("unauthorized")
        with self.assertRaises(permissions.PermissionBreach):
            permissions.enforce(self.run, None, self.agent, before)
        self.assertEqual(file.read_text(), "operator notes")

    def test_new_unauthorized_file_is_removed(self):
        before = permissions.snapshot(self.run)
        file = self.root / "introduced.txt"
        file.write_text("bad")
        with self.assertRaises(permissions.PermissionBreach):
            permissions.enforce(self.run, None, self.agent, before)
        self.assertFalse(file.exists())


class PlannerRecoveryTests(unittest.TestCase):
    """The engine owns the plan destination; a misplaced plan.md is relocated,
    audited, and bounded — everything else still breaches."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="crew-recovery-")
        self.root = Path(self.temp.name)
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        (self.root / "protected.txt").write_text("initial\n")
        subprocess.run(["git", "add", "."], cwd=self.root, check=True)
        from adw_modules import agents
        self.run = SimpleNamespace(
            repo_root=self.root,
            context_handoff_dir=Path("adws/adw_data/sessions/deadbeef/context_handoff"),
            adw_id="deadbeef",
            cfg=SSSFConfig(),
        )
        self.phase = SimpleNamespace(phase_id="deadbeef_02_plan")
        self.planner = AgentConfig(name="planner", purpose="test", writes=["specs/"],
                                   prompt_engineering={"system": "x", "user": "y"})
        self.recover = agents._misplaced_plan_recoverer(self.run, self.phase, self.planner)

    def tearDown(self):
        self.temp.cleanup()

    def test_literal_context_handoff_dir_is_relocated(self):
        from adw_modules import agents as _a
        _ = _a  # import sanity: recoverer came from the engine module
        before = permissions.snapshot(self.run)
        stray = self.root / "context_handoff" / "plan.md"
        stray.parent.mkdir(parents=True)
        stray.write_text("# real plan\n")
        touched = permissions.enforce(self.run, self.phase, self.planner, before, recover=self.recover)
        dest = self.root / "adws" / "adw_data" / "sessions" / "deadbeef" / "context_handoff" / "plan.md"
        self.assertEqual(dest.read_text(), "# real plan\n")
        self.assertFalse(stray.exists())
        self.assertFalse((self.root / "context_handoff").exists())
        self.assertNotIn("context_handoff/plan.md", touched)

    def test_relative_sessions_path_is_relocated(self):
        before = permissions.snapshot(self.run)
        stray = self.root / "sessions" / "deadbeef" / "context_handoff" / "plan.md"
        stray.parent.mkdir(parents=True)
        stray.write_text("# plan v2\n")
        permissions.enforce(self.run, self.phase, self.planner, before, recover=self.recover)
        dest = self.root / "adws" / "adw_data" / "sessions" / "deadbeef" / "context_handoff" / "plan.md"
        self.assertEqual(dest.read_text(), "# plan v2\n")
        self.assertFalse(stray.exists())

    def test_conflicting_plan_is_not_clobbered(self):
        dest = self.root / "adws" / "adw_data" / "sessions" / "deadbeef" / "context_handoff" / "plan.md"
        dest.parent.mkdir(parents=True)
        dest.write_text("# correct plan\n")
        before = permissions.snapshot(self.run)
        stray = self.root / "context_handoff" / "plan.md"
        stray.parent.mkdir(parents=True)
        stray.write_text("# impostor plan\n")
        with self.assertRaises(permissions.PermissionBreach):
            permissions.enforce(self.run, self.phase, self.planner, before, recover=self.recover)
        self.assertEqual(dest.read_text(), "# correct plan\n")

    def test_other_files_still_breach(self):
        before = permissions.snapshot(self.run)
        evil = self.root / "context_handoff" / "notes.txt"
        evil.parent.mkdir(parents=True)
        evil.write_text("nope")
        with self.assertRaises(permissions.PermissionBreach):
            permissions.enforce(self.run, self.phase, self.planner, before, recover=self.recover)
        self.assertFalse(evil.exists())

    def test_root_level_plan_still_breaches(self):
        # plan.md directly at the repo root is NOT an authorized shape:
        # recovery only accepts context_handoff-style parents.
        before = permissions.snapshot(self.run)
        stray = self.root / "plan.md"
        stray.write_text("# stray plan\n")
        with self.assertRaises(permissions.PermissionBreach):
            permissions.enforce(self.run, self.phase, self.planner, before, recover=self.recover)
        self.assertFalse(stray.exists())
        dest = self.root / "adws" / "adw_data" / "sessions" / "deadbeef" / "context_handoff" / "plan.md"
        self.assertFalse(dest.exists())

    def test_non_planner_gets_no_recoverer(self):
        from adw_modules import agents
        scout = AgentConfig(name="scout", purpose="test", writes=[],
                            prompt_engineering={"system": "x", "user": "y"})
        self.assertIsNone(agents._misplaced_plan_recoverer(self.run, self.phase, scout))


class BudgetTrackerTests(unittest.TestCase):
    """The engine-owned spend ceiling trips on cumulative turn occupancy."""

    def test_trips_past_ceiling(self):
        from adw_modules import agents
        track = agents._budget_tracker("planner", 10000)
        track({"totalTokens": 6000})
        with self.assertRaises(agents.TokenBudgetExceeded):
            track({"totalTokens": 5000})

    def test_stays_quiet_under_ceiling(self):
        from adw_modules import agents
        track = agents._budget_tracker("builder", 150000)
        track({"totalTokens": 60000})
        track({"input": 20000, "output": 5000, "cacheRead": 10000, "cacheWrite": 0})
        # no raise: 60000 + 35000 < 150000

    def test_none_limit_never_trips(self):
        from adw_modules import agents
        track = agents._budget_tracker("scout", None)
        track({"totalTokens": 999999999})
        # no raise


if __name__ == "__main__":
    unittest.main()
