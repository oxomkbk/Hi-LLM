#!/usr/bin/env python3
"""Minimal internal HTTP boundary for the isolated Skill scanner."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import stat
import tempfile
import time
import uuid
import zipfile
import unicodedata
from argparse import Namespace
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path, PurePosixPath
from typing import Any

from entrypoint import ScannerContractError, read_integer_environment, required_environment, run_scan

TOKEN_AUDIENCE = "hillm-nav-ai-security-scanner"


class ScannerRequestError(RuntimeError):
    def __init__(self, code: str, status: int):
        super().__init__(code)
        self.code = code
        self.status = status


class ScannerRequestHandler(BaseHTTPRequestHandler):
    server_version = "HiLLMNAVSecurityScanner/1"

    def do_GET(self) -> None:
        if self.path == "/health/live":
            self.send_json(200, {"status": "live"})
            return
        if self.path == "/health/ready":
            try:
                model = scanner_readiness()
                self.send_json(200, {"model": model, "scanner": "aig-skill-scan", "status": "ready", "version": "0.2.1"})
            except ScannerRequestError as error:
                self.send_json(error.status, {"code": error.code})
            return
        self.send_json(404, {"code": "SCANNER_ROUTE_NOT_FOUND"})

    def do_POST(self) -> None:
        if self.path != "/v1/scan/skill":
            self.send_json(404, {"code": "SCANNER_ROUTE_NOT_FOUND"})
            return
        try:
            self.connection.settimeout(30)
            claims = verify_job_token(self.headers.get("Authorization", ""))
            archive_size = required_content_length(self.headers.get("Content-Length"))
            if self.headers.get_content_type() != "application/zip":
                raise ScannerRequestError("SCANNER_INPUT_INVALID", 415)
            report = scan_archive_request(self.rfile, archive_size, claims)
            self.send_json(200, report)
        except ScannerRequestError as error:
            self.send_json(error.status, {"code": error.code})
        except ScannerContractError as error:
            status = 413 if error.code == "SOURCE_LIMIT_EXCEEDED" else 422
            self.send_json(status, {"code": error.code})
        except (ConnectionError, OSError, TimeoutError):
            self.send_json(400, {"code": "SCANNER_REQUEST_FAILED"})
        except Exception:
            self.send_json(500, {"code": "SCANNER_INTERNAL_ERROR"})

    def log_message(self, _format: str, *_args: object) -> None:
        return

    def send_json(self, status: int, value: object) -> None:
        body = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)


def decode_base64url(value: str) -> bytes:
    if not value or len(value) > 4096 or re.fullmatch(r"[A-Za-z0-9_-]+", value) is None:
        raise ScannerRequestError("SCANNER_AUTH_FAILED", 401)
    try:
        return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    except (ValueError, TypeError) as error:
        raise ScannerRequestError("SCANNER_AUTH_FAILED", 401) from error


def extract_archive(archive_file: Path, destination: Path) -> set[str]:
    max_files = read_integer_environment("SCANNER_MAX_FILES", 5000, 1, 20000)
    max_file_bytes = read_integer_environment("SCANNER_MAX_FILE_BYTES", 2 * 1024 * 1024, 1024, 50 * 1024 * 1024)
    max_total_bytes = read_integer_environment("SCANNER_MAX_TOTAL_BYTES", 30 * 1024 * 1024, 1024, 200 * 1024 * 1024)
    max_depth = read_integer_environment("SCANNER_MAX_ARCHIVE_DEPTH", 32, 1, 64)
    destination.mkdir(mode=0o700)
    paths: set[str] = set()
    total_bytes = 0
    try:
        with zipfile.ZipFile(archive_file) as archive:
            entries = archive.infolist()
            if len(entries) > max_files:
                raise ScannerRequestError("SOURCE_LIMIT_EXCEEDED", 413)
            for entry in entries:
                path = safe_archive_path(entry.filename, max_depth)
                if path in paths:
                    raise ScannerRequestError("SCANNER_INPUT_INVALID", 400)
                paths.add(path)
                mode = entry.external_attr >> 16
                file_type = stat.S_IFMT(mode)
                if entry.flag_bits & 1 or stat.S_ISLNK(mode) or file_type not in {0, stat.S_IFREG, stat.S_IFDIR}:
                    raise ScannerRequestError("SCANNER_INPUT_INVALID", 400)
                if entry.is_dir():
                    (destination / path).mkdir(parents=True, exist_ok=True)
                    continue
                total_bytes += entry.file_size
                if entry.file_size > max_file_bytes or total_bytes > max_total_bytes:
                    raise ScannerRequestError("SOURCE_LIMIT_EXCEEDED", 413)
                if entry.file_size > 0 and entry.compress_size == 0:
                    raise ScannerRequestError("SCANNER_INPUT_INVALID", 400)
                if entry.file_size > max(1024 * 1024, entry.compress_size * 200):
                    raise ScannerRequestError("SOURCE_LIMIT_EXCEEDED", 413)
                target = destination / path
                target.parent.mkdir(parents=True, exist_ok=True)
                written = 0
                with archive.open(entry, "r") as source, target.open("xb") as output:
                    while True:
                        chunk = source.read(64 * 1024)
                        if not chunk:
                            break
                        written += len(chunk)
                        if written > entry.file_size or written > max_file_bytes:
                            raise ScannerRequestError("SOURCE_LIMIT_EXCEEDED", 413)
                        output.write(chunk)
                if written != entry.file_size:
                    raise ScannerRequestError("SCANNER_INPUT_INVALID", 400)
                target.chmod(0o400)
    except (zipfile.BadZipFile, zipfile.LargeZipFile, RuntimeError) as error:
        raise ScannerRequestError("SCANNER_INPUT_INVALID", 400) from error
    if "SKILL.md" not in paths or not (destination / "SKILL.md").is_file():
        raise ScannerRequestError("SCANNER_INPUT_INVALID", 400)
    return {path for path in paths if (destination / path).is_file()}


def main() -> None:
    scanner_readiness()
    host = os.environ.get("SCANNER_LISTEN_HOST", "0.0.0.0")
    port = read_integer_environment("SCANNER_LISTEN_PORT", 8091, 1024, 65535)
    server = HTTPServer((host, port), ScannerRequestHandler)
    server.serve_forever(poll_interval=0.5)


def required_content_length(value: str | None) -> int:
    try:
        size = int(value or "")
    except ValueError as error:
        raise ScannerRequestError("SCANNER_INPUT_INVALID", 411) from error
    maximum = read_integer_environment("SCANNER_MAX_ARCHIVE_BYTES", 100 * 1024 * 1024, 1024, 512 * 1024 * 1024)
    if size < 1 or size > maximum:
        raise ScannerRequestError("SOURCE_LIMIT_EXCEEDED", 413)
    return size


def safe_archive_path(value: str, max_depth: int) -> str:
    value = unicodedata.normalize("NFC", value)
    if (not value or "\\" in value or value.startswith("/")
            or any(ord(character) <= 31 or ord(character) == 127 for character in value)):
        raise ScannerRequestError("SCANNER_INPUT_INVALID", 400)
    path = PurePosixPath(value.rstrip("/"))
    if not path.parts or len(path.parts) > max_depth or any(part in {"", ".", ".."} for part in path.parts):
        raise ScannerRequestError("SCANNER_INPUT_INVALID", 400)
    normalized = str(path)
    if len(normalized) > 1000 or (path.parts and ":" in path.parts[0]):
        raise ScannerRequestError("SCANNER_INPUT_INVALID", 400)
    return normalized


def scan_archive_request(stream: Any, archive_size: int, claims: dict[str, Any]) -> dict[str, Any]:
    temporary_root = Path(os.environ.get("SCANNER_TEMP_ROOT", "/work/tmp"))
    temporary_root.mkdir(mode=0o700, parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=f"job-{claims['jobId']}-", dir=temporary_root) as temporary:
        job_root = Path(temporary)
        archive_file = job_root / "input.zip"
        remaining = archive_size
        with archive_file.open("xb") as output:
            while remaining:
                chunk = stream.read(min(64 * 1024, remaining))
                if not chunk:
                    raise ScannerRequestError("SCANNER_INPUT_INVALID", 400)
                output.write(chunk)
                remaining -= len(chunk)
        input_directory = job_root / "input"
        output_directory = job_root / "output"
        output_directory.mkdir(mode=0o700)
        extract_archive(archive_file, input_directory)
        report = run_scan(
            Namespace(
                input=str(input_directory),
                job_token=claims["token"],
                output=str(output_directory / "report.sarif.json"),
            ),
            input_root_override=input_directory,
            output_root_override=output_directory,
            process_working_directory_override=job_root,
        )
        return report


def scanner_readiness() -> str:
    try:
        secret = required_environment("SCANNER_SHARED_SECRET", 4096)
        model = required_environment("SCANNER_MODEL", 200)
        required_environment("LLM_GATEWAY_URL", 2048)
    except ScannerContractError as error:
        raise ScannerRequestError(error.code, 503) from error
    if len(secret.encode("utf-8")) < 32:
        raise ScannerRequestError("SCANNER_CONFIG_INVALID", 503)
    if not Path("/opt/venv/bin/aig-skill-scan").is_file() and os.environ.get("SCANNER_TEST_MODE") != "1":
        raise ScannerRequestError("SCANNER_VERSION_CHANGED", 503)
    return model


def verify_job_token(authorization: str) -> dict[str, Any]:
    if not authorization.startswith("Bearer "):
        raise ScannerRequestError("SCANNER_AUTH_FAILED", 401)
    token = authorization[7:]
    parts = token.split(".")
    if len(parts) != 2:
        raise ScannerRequestError("SCANNER_AUTH_FAILED", 401)
    payload_part, signature_part = parts
    secret = required_environment("SCANNER_SHARED_SECRET", 4096).encode("utf-8")
    expected = hmac.new(secret, payload_part.encode("ascii"), hashlib.sha256).digest()
    signature = decode_base64url(signature_part)
    if not hmac.compare_digest(expected, signature):
        raise ScannerRequestError("SCANNER_AUTH_FAILED", 401)
    try:
        claims = json.loads(decode_base64url(payload_part))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ScannerRequestError("SCANNER_AUTH_FAILED", 401) from error
    if not isinstance(claims, dict) or set(claims) != {"aud", "exp", "jobId", "model", "subjectType"}:
        raise ScannerRequestError("SCANNER_AUTH_FAILED", 401)
    now = int(time.time())
    if claims.get("aud") != TOKEN_AUDIENCE or claims.get("subjectType") != "skill":
        raise ScannerRequestError("SCANNER_AUTH_FAILED", 401)
    if not isinstance(claims.get("exp"), int) or claims["exp"] < now or claims["exp"] > now + 900:
        raise ScannerRequestError("SCANNER_AUTH_FAILED", 401)
    try:
        uuid.UUID(str(claims.get("jobId")))
    except ValueError as error:
        raise ScannerRequestError("SCANNER_AUTH_FAILED", 401) from error
    expected_model = required_environment("SCANNER_MODEL", 200)
    if claims.get("model") != expected_model:
        raise ScannerRequestError("SCANNER_AUTH_FAILED", 401)
    return {**claims, "token": token}


if __name__ == "__main__":
    main()
