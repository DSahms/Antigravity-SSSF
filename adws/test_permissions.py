# /// script
# dependencies = ["pydantic"]
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


if __name__ == "__main__":
    unittest.main()
