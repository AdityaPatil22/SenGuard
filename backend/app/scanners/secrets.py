from __future__ import annotations

import asyncio
import json
import logging
import re
import shutil

from app.scanners import Finding

logger = logging.getLogger(__name__)

SECRET_PATTERNS: list[tuple[str, re.Pattern, str]] = [
    ("AWS Access Key", re.compile(r"(?:^|['\"\s=])?(AKIA[0-9A-Z]{16})"), "Rotate this AWS access key immediately."),
    ("AWS Secret Key", re.compile(r"(?i)aws[_\-]?secret[_\-]?access[_\-]?key\s*[=:]\s*['\"]?([A-Za-z0-9/+=]{40})"), "Rotate this AWS secret key."),
    ("GitHub Token", re.compile(r"(ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|ghs_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,})"), "Revoke and regenerate this GitHub token."),
    ("OpenAI API Key", re.compile(r"(sk-[A-Za-z0-9]{20,})"), "Rotate this OpenAI API key."),
    ("Google API Key", re.compile(r"(AIza[0-9A-Za-z\-_]{35})"), "Restrict or rotate this Google API key."),
    ("Slack Token", re.compile(r"(xox[bpoas]-[0-9A-Za-z\-]{10,})"), "Revoke this Slack token."),
    ("Private Key", re.compile(r"(-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----)"), "Remove private key from source code."),
    ("Generic Secret Assignment", re.compile(r"""(?i)(?:password|passwd|secret|token|api_key|apikey|api-key)\s*[=:]\s*['"]([^'"]{8,})['"]"""), "Move this secret to environment variables."),
    ("Connection String", re.compile(r"(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis)://[^\s'\"]{10,}"), "Move connection strings to environment variables."),
    ("JWT/Bearer Token", re.compile(r"(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})"), "Remove hardcoded JWT tokens."),
]

IGNORE_PATHS = {".env.example", ".env.sample", ".env.template"}


def _is_test_or_example(path: str) -> bool:
    lower = path.lower()
    return any(s in lower for s in ("test", "example", "sample", "mock", "fixture", ".env.example"))


async def _run_gitleaks(repo_path: str) -> list[Finding]:
    if not shutil.which("gitleaks"):
        return []

    try:
        proc = await asyncio.create_subprocess_exec(
            "gitleaks", "detect", "--source", repo_path,
            "--report-format", "json", "--report-path", "/dev/stdout",
            "--no-git", "--exit-code", "0",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=60)
        if not stdout.strip():
            return []

        leaks = json.loads(stdout)
        findings = []
        for leak in leaks:
            severity = "critical" if not _is_test_or_example(leak.get("File", "")) else "medium"
            findings.append(Finding(
                source="gitleaks",
                severity=severity,
                category="hardcoded-secret",
                description=f"{leak.get('Description', 'Secret detected')}: {leak.get('RuleID', 'unknown rule')}",
                recommendation="Remove this secret and rotate the credential.",
                confidence="verified",
                file=leak.get("File"),
                line=leak.get("StartLine"),
                evidence=leak.get("Match", "")[:200],
            ))
        return findings
    except Exception as e:
        logger.warning("gitleaks failed: %s", e)
        return []


def _scan_with_regex(repo_files: list[dict[str, str]]) -> list[Finding]:
    findings = []
    for f in repo_files:
        path = f["path"]
        if any(path.endswith(ig) for ig in IGNORE_PATHS):
            continue

        for line_num, line in enumerate(f["content"].splitlines(), 1):
            stripped = line.strip()
            if stripped.startswith("#") or stripped.startswith("//") or stripped.startswith("*"):
                continue

            for name, pattern, rec in SECRET_PATTERNS:
                if pattern.search(line):
                    severity = "high" if not _is_test_or_example(path) else "medium"
                    findings.append(Finding(
                        source="regex-secret-scanner",
                        severity=severity,
                        category="hardcoded-secret",
                        description=f"Possible {name} detected.",
                        recommendation=rec,
                        confidence="observed",
                        file=path,
                        line=line_num,
                        evidence=line.strip()[:200],
                    ))
                    break
    return findings


async def scan_secrets(repo_files: list[dict[str, str]], repo_path: str | None = None) -> list[Finding]:
    if repo_path:
        gitleaks_findings = await _run_gitleaks(repo_path)
        if gitleaks_findings:
            return gitleaks_findings

    return _scan_with_regex(repo_files)
