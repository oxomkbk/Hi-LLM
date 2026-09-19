#!/usr/bin/env python3
"""Fixed-argument, resource-bounded aig-skill-scan process wrapper."""

from __future__ import annotations

import argparse
import json
import os
import resource
import stat
import subprocess
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

SCANNER_EXECUTABLE = "/opt/venv/bin/aig-skill-scan"
SCANNER_NAME = "aig-skill-scan"
SCANNER_VERSION = "0.2.1"


class ScannerContractError(RuntimeError):
    """Stable scanner wrapper failure."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def build_command(input_directory: Path, output_file: Path, model: str, base_url: str) -> list[str]:
    return [
        SCANNER_EXECUTABLE,
        "--repo",
        str(input_directory),
        "--model",
        model,
        "--base_url",
        base_url,
        "--language",
        "zh",
        "--output",
        str(output_file),
    ]


def build_subprocess_environment(job_token: str) -> dict[str, str]:
    return {
        "HOME": "/nonexistent",
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
        "LLM_API_KEY": job_token,
        "PATH": "/opt/venv/bin:/usr/local/bin:/usr/bin:/bin",
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONUNBUFFERED": "1",
    }


def validate_input_tree(input_directory: Path, allowed_root: Path) -> dict[str, int]:
    root = input_directory.resolve(strict=True)
    boundary = allowed_root.resolve(strict=True)
    if not root.is_relative_to(boundary):
        raise ScannerContractError("SCANNER_INPUT_INVALID", "Input directory is outside the scanner boundary")
    if not root.is_dir() or not (root / "SKILL.md").is_file():
        raise ScannerContractError("SCANNER_INPUT_INVALID", "A root SKILL.md file is required")

    max_files = read_integer_environment("SCANNER_MAX_FILES", 5000, 1, 20000)
    max_file_bytes = read_integer_environment("SCANNER_MAX_FILE_BYTES", 2 * 1024 * 1024, 1024, 50 * 1024 * 1024)
    max_total_bytes = read_integer_environment("SCANNER_MAX_TOTAL_BYTES", 30 * 1024 * 1024, 1024, 200 * 1024 * 1024)
    file_count = 0
    total_bytes = 0
    for path in root.rglob("*"):
        metadata = path.lstat()
        if stat.S_ISLNK(metadata.st_mode):
            raise ScannerContractError("SCANNER_INPUT_INVALID", "Symbolic links are not allowed")
        if path.is_dir():
            continue
        if not stat.S_ISREG(metadata.st_mode):
            raise ScannerContractError("SCANNER_INPUT_INVALID", "Only regular files are allowed")
        file_count += 1
        total_bytes += metadata.st_size
        if file_count > max_files or metadata.st_size > max_file_bytes or total_bytes > max_total_bytes:
            raise ScannerContractError("SOURCE_LIMIT_EXCEEDED", "Scanner input exceeds configured limits")
    return {"fileCount": file_count, "totalBytes": total_bytes}


def validate_sarif(report_file: Path) -> dict[str, Any]:
    maximum = read_integer_environment("SCANNER_MAX_REPORT_BYTES", 4 * 1024 * 1024, 1024, 16 * 1024 * 1024)
    metadata = report_file.stat()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > maximum:
        raise ScannerContractError("SCANNER_REPORT_INVALID", "Scanner report exceeds the allowed size")
    try:
        report = json.loads(report_file.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ScannerContractError("SCANNER_REPORT_INVALID", "Scanner report is not valid UTF-8 JSON") from error
    if not isinstance(report, dict) or report.get("version") != "2.1.0":
        raise ScannerContractError("SCANNER_REPORT_INVALID", "Scanner report is not SARIF 2.1.0")
    runs = report.get("runs")
    if not isinstance(runs, list) or len(runs) != 1 or not isinstance(runs[0], dict):
        raise ScannerContractError("SCANNER_REPORT_INVALID", "Scanner report must contain exactly one run")
    driver = ((runs[0].get("tool") or {}).get("driver") or {})
    if driver.get("name") != SCANNER_NAME or driver.get("version") != SCANNER_VERSION:
        raise ScannerContractError("SCANNER_VERSION_CHANGED", "Scanner report version does not match the pinned adapter")
    if not isinstance(runs[0].get("results"), list):
        raise ScannerContractError("SCANNER_REPORT_INVALID", "Scanner results must be an array")
    return report


def run_scan(
    args: argparse.Namespace,
    input_root_override: Path | None = None,
    output_root_override: Path | None = None,
    process_working_directory_override: Path | None = None,
) -> dict[str, Any]:
    input_root = input_root_override or Path(os.environ.get("SCANNER_INPUT_ROOT", "/work/input"))
    output_root = output_root_override or Path(os.environ.get("SCANNER_OUTPUT_ROOT", "/work/output"))
    input_directory = Path(args.input).resolve(strict=True)
    output_file = Path(args.output).resolve(strict=False)
    output_boundary = output_root.resolve(strict=True)
    process_working_directory = (
        process_working_directory_override or Path(os.environ.get("SCANNER_TEMP_ROOT", "/work/tmp"))
    ).resolve(strict=True)
    if output_file.parent != output_boundary or output_file.name != "report.sarif.json":
        raise ScannerContractError("SCANNER_OUTPUT_INVALID", "Output path is not the fixed scanner report path")
    validate_input_tree(input_directory, input_root)

    model = required_environment("SCANNER_MODEL", 200)
    base_url = required_http_url_environment("LLM_GATEWAY_URL")
    timeout_seconds = read_integer_environment("SCANNER_TIMEOUT_SECONDS", 600, 60, 3600)
    command = build_command(input_directory, output_file, model, base_url)
    environment = build_subprocess_environment(args.job_token)

    with tempfile.TemporaryFile(mode="w+b") as process_output:
        try:
            completed = subprocess.run(
                command,
                check=False,
                cwd=process_working_directory,
                env=environment,
                preexec_fn=apply_child_limits,
                stderr=process_output,
                stdout=process_output,
                timeout=timeout_seconds,
            )
        except subprocess.TimeoutExpired as error:
            raise ScannerContractError("SECURITY_WORKER_TIMEOUT", "Skill scanner exceeded its deadline") from error
        if completed.returncode != 0:
            raise ScannerContractError("SCANNER_PROCESS_FAILED", "Skill scanner exited unsuccessfully")
    return validate_sarif(output_file)


def apply_child_limits() -> None:
    memory_bytes = read_integer_environment("SCANNER_MAX_MEMORY_BYTES", 768 * 1024 * 1024, 128 * 1024 * 1024, 2 * 1024 * 1024 * 1024)
    output_bytes = read_integer_environment("SCANNER_MAX_PROCESS_OUTPUT_BYTES", 8 * 1024 * 1024, 1024, 32 * 1024 * 1024)
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_FSIZE, (output_bytes, output_bytes))
    resource.setrlimit(resource.RLIMIT_NOFILE, (128, 128))
    resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))
    resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="/work/input")
    parser.add_argument("--job-token", required=True)
    parser.add_argument("--output", default="/work/output/report.sarif.json")
    args = parser.parse_args()
    try:
        report = run_scan(args)
        print(json.dumps(report, ensure_ascii=False, separators=(",", ":")))
        return 0
    except ScannerContractError as error:
        print(json.dumps({"code": error.code}, separators=(",", ":")))
        return 2


def read_integer_environment(name: str, fallback: int, minimum: int, maximum: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return fallback
    try:
        value = int(raw)
    except ValueError as error:
        raise ScannerContractError("SCANNER_CONFIG_INVALID", f"{name} is not an integer") from error
    if value < minimum or value > maximum:
        raise ScannerContractError("SCANNER_CONFIG_INVALID", f"{name} is outside the allowed range")
    return value


def required_environment(name: str, maximum: int) -> str:
    value = os.environ.get(name, "").strip()
    if not value or len(value) > maximum or any(ord(character) < 32 for character in value):
        raise ScannerContractError("SCANNER_CONFIG_INVALID", f"{name} is invalid")
    return value


def required_http_url_environment(name: str) -> str:
    value = required_environment(name, 2048)
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ScannerContractError("SCANNER_CONFIG_INVALID", f"{name} must be an HTTP(S) URL")
    if parsed.query or parsed.fragment:
        raise ScannerContractError("SCANNER_CONFIG_INVALID", f"{name} cannot contain a query or fragment")
    return value.rstrip("/")


if __name__ == "__main__":
    raise SystemExit(main())
