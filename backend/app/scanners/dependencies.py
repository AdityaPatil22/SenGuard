from __future__ import annotations

import json
import logging
import re

import httpx

from app.scanners import Finding

logger = logging.getLogger(__name__)

OSV_API = "https://api.osv.dev/v1/query"


def _parse_requirements_txt(content: str) -> list[tuple[str, str, str]]:
    """Returns list of (package, version, ecosystem)."""
    deps = []
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("-"):
            continue
        m = re.match(r"^([A-Za-z0-9_.-]+)\s*[=~!><]=?\s*([0-9][0-9A-Za-z.*-]*)", line)
        if m:
            deps.append((m.group(1), m.group(2).rstrip("*").rstrip("."), "PyPI"))
    return deps


def _parse_package_json(content: str) -> list[tuple[str, str, str]]:
    """Returns list of (package, version, ecosystem)."""
    deps = []
    try:
        pkg = json.loads(content)
    except (json.JSONDecodeError, ValueError):
        return deps
    for section in ("dependencies", "devDependencies"):
        for name, ver in pkg.get(section, {}).items():
            clean = re.sub(r"^[~^>=<]*", "", ver).strip()
            if clean and clean[0].isdigit():
                deps.append((name, clean, "npm"))
    return deps


def _extract_deps(repo_files: list[dict[str, str]]) -> list[tuple[str, str, str, str]]:
    """Returns (package, version, ecosystem, file)."""
    all_deps = []
    for f in repo_files:
        path = f["path"]
        lower = path.lower()
        if (
            lower.endswith("requirements.txt")
            or lower.endswith("requirements-base.txt")
            or "requirements" in lower
            and lower.endswith(".txt")
        ):
            for pkg, ver, eco in _parse_requirements_txt(f["content"]):
                all_deps.append((pkg, ver, eco, path))
        elif lower.endswith("package.json"):
            for pkg, ver, eco in _parse_package_json(f["content"]):
                all_deps.append((pkg, ver, eco, path))
    return all_deps


async def _query_osv(package: str, version: str, ecosystem: str) -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                OSV_API,
                json={
                    "package": {"name": package, "ecosystem": ecosystem},
                    "version": version,
                },
            )
            if resp.status_code == 200:
                return resp.json().get("vulns", [])
    except Exception as e:
        logger.debug("OSV query failed for %s: %s", package, e)
    return []


async def scan_dependencies(repo_files: list[dict[str, str]]) -> list[Finding]:
    deps = _extract_deps(repo_files)
    if not deps:
        return []

    findings = []
    for pkg, ver, eco, path in deps:
        vulns = await _query_osv(pkg, ver, eco)
        for vuln in vulns:
            vuln_id = vuln.get("id", "unknown")
            summary = vuln.get("summary", "Known vulnerability")[:200]
            severity_list = vuln.get("severity", [])
            sev = "medium"
            if severity_list:
                cvss = severity_list[0].get("score", "")
                if isinstance(cvss, str):
                    try:
                        score = float(cvss.split("/")[0]) if "/" in cvss else float(cvss)
                        if score >= 9.0:
                            sev = "critical"
                        elif score >= 7.0:
                            sev = "high"
                        elif score >= 4.0:
                            sev = "medium"
                        else:
                            sev = "low"
                    except ValueError:
                        pass

            findings.append(
                Finding(
                    source="osv-scanner",
                    severity=sev,
                    category="vulnerable-dependency",
                    description=f"{vuln_id}: {summary}",
                    recommendation=f"Upgrade {pkg} to a patched version.",
                    confidence="verified",
                    file=path,
                    line=None,
                    evidence=f"{pkg}=={ver} — {vuln_id}",
                )
            )

    return findings
