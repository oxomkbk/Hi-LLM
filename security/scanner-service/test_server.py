from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import stat
import tempfile
import time
import unittest
import uuid
import zipfile
from pathlib import Path
from unittest.mock import patch

from server import ScannerRequestError, extract_archive, safe_archive_path, verify_job_token

SECRET = "scanner-test-secret-that-is-at-least-32-bytes"


def base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def token(overrides: dict[str, object] | None = None) -> str:
    claims = {
        "aud": "hillm-nav-ai-security-scanner",
        "exp": int(time.time()) + 300,
        "jobId": str(uuid.uuid4()),
        "model": "model-1",
        "subjectType": "skill",
    }
    claims.update(overrides or {})
    payload = base64url(json.dumps(claims, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    signature = base64url(hmac.new(SECRET.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest())
    return f"{payload}.{signature}"


class ScannerServerTests(unittest.TestCase):
    def test_verifies_a_short_lived_fixed_model_job_token(self) -> None:
        with patch.dict(os.environ, {"SCANNER_MODEL": "model-1", "SCANNER_SHARED_SECRET": SECRET}):
            claims = verify_job_token(f"Bearer {token()}")
            self.assertEqual(claims["subjectType"], "skill")
            with self.assertRaises(ScannerRequestError):
                verify_job_token(f"Bearer {token({'model': 'other'})}")

    def test_rejects_unsafe_archive_paths(self) -> None:
        for path in ("../secret", "/etc/passwd", "folder\\secret", "C:/secret"):
            with self.subTest(path=path), self.assertRaises(ScannerRequestError):
                safe_archive_path(path, 10)

    def test_extracts_regular_files_and_requires_root_skill_document(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / "input.zip"
            destination = root / "output"
            with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as output:
                output.writestr("SKILL.md", "# Safe")
                output.writestr("README.md", "Fixture")
            paths = extract_archive(archive, destination)
            self.assertEqual(paths, {"README.md", "SKILL.md"})
            self.assertEqual((destination / "SKILL.md").read_text(encoding="utf-8"), "# Safe")

    def test_rejects_symbolic_link_archive_entries(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / "input.zip"
            destination = root / "output"
            link = zipfile.ZipInfo("SKILL.md")
            link.create_system = 3
            link.external_attr = (stat.S_IFLNK | 0o777) << 16
            with zipfile.ZipFile(archive, "w") as output:
                output.writestr(link, "../outside")
            with self.assertRaises(ScannerRequestError):
                extract_archive(archive, destination)


if __name__ == "__main__":
    unittest.main()
