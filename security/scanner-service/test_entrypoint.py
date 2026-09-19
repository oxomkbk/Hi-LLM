from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from entrypoint import (
    SCANNER_EXECUTABLE,
    ScannerContractError,
    build_command,
    build_subprocess_environment,
    validate_input_tree,
    validate_sarif,
)


class ScannerEntrypointTests(unittest.TestCase):
    def test_builds_fixed_command_without_credential_argument(self) -> None:
        command = build_command(Path("/work/input"), Path("/work/output/report.sarif.json"), "model-1", "http://gateway/v1")
        self.assertEqual(command[0], SCANNER_EXECUTABLE)
        self.assertNotIn("--api_key", command)
        self.assertNotIn("secret-token", command)
        self.assertEqual(build_subprocess_environment("secret-token")["LLM_API_KEY"], "secret-token")

    def test_accepts_bounded_regular_skill_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            skill = root / "skill"
            skill.mkdir()
            (skill / "SKILL.md").write_text("# Safe", encoding="utf-8")
            with patch.dict(os.environ, {"SCANNER_MAX_FILES": "2", "SCANNER_MAX_TOTAL_BYTES": "1024"}):
                self.assertEqual(validate_input_tree(skill, root)["fileCount"], 1)

    def test_rejects_symbolic_links(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            skill = root / "skill"
            skill.mkdir()
            (skill / "SKILL.md").write_text("# Unsafe", encoding="utf-8")
            (skill / "outside").symlink_to(root)
            with self.assertRaises(ScannerContractError):
                validate_input_tree(skill, root)

    def test_requires_pinned_sarif_tool_version(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            report = Path(temporary) / "report.json"
            report.write_text(json.dumps({
                "runs": [{
                    "results": [],
                    "tool": {"driver": {"name": "aig-skill-scan", "version": "0.2.1"}},
                }],
                "version": "2.1.0",
            }), encoding="utf-8")
            self.assertEqual(validate_sarif(report)["version"], "2.1.0")
            data = json.loads(report.read_text(encoding="utf-8"))
            data["runs"][0]["tool"]["driver"]["version"] = "changed"
            report.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaises(ScannerContractError):
                validate_sarif(report)


if __name__ == "__main__":
    unittest.main()
