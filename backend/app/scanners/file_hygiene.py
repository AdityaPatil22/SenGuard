from __future__ import annotations

import re

from app.scanners import Finding

CORS_WILDCARD = re.compile(r"""(?:cors|CORS|allow.?origin)[^\n]*['"\s*][*]['"\s]""")
DEBUG_ENABLED = re.compile(r"""(?:DEBUG|debug)\s*[=:]\s*(?:True|true|1|['"]true['"])""")


async def scan_file_hygiene(repo_files: list[dict[str, str]]) -> list[Finding]:
    findings = []
    paths = {f["path"] for f in repo_files}

    # .env files committed (not just examples)
    for path in paths:
        basename = path.rsplit("/", 1)[-1] if "/" in path else path
        if basename == ".env":
            findings.append(Finding(
                source="hygiene-scanner",
                severity="high",
                category="env-file-committed",
                description=".env file is committed to the repository, likely containing secrets.",
                recommendation="Add .env to .gitignore and remove from version control.",
                confidence="verified",
                file=path,
                line=None,
                evidence=".env file present in repository",
            ))

    # Missing .gitignore
    has_gitignore = any(f["path"].rsplit("/", 1)[-1] == ".gitignore" for f in repo_files)
    if not has_gitignore:
        findings.append(Finding(
            source="hygiene-scanner",
            severity="medium",
            category="no-gitignore",
            description="Repository has no .gitignore file, risking accidental commit of sensitive files.",
            recommendation="Add a .gitignore appropriate for the project's language/framework.",
            confidence="verified",
            file=None,
            line=None,
            evidence="No .gitignore file found in repository",
        ))

    for f in repo_files:
        path = f["path"]
        content = f["content"]

        # CORS wildcard
        if CORS_WILDCARD.search(content):
            for line_num, line in enumerate(content.splitlines(), 1):
                if CORS_WILDCARD.search(line):
                    findings.append(Finding(
                        source="hygiene-scanner",
                        severity="high",
                        category="cors-wildcard",
                        description="CORS is configured with wildcard origin (*), allowing any domain.",
                        recommendation="Restrict CORS to specific trusted origins.",
                        confidence="observed",
                        file=path,
                        line=line_num,
                        evidence=line.strip()[:200],
                    ))
                    break

        # Debug mode enabled
        lower_path = path.lower()
        is_config = any(s in lower_path for s in ("config", "settings", "env", "app.py", "main.py"))
        if is_config and DEBUG_ENABLED.search(content):
            for line_num, line in enumerate(content.splitlines(), 1):
                if DEBUG_ENABLED.search(line):
                    findings.append(Finding(
                        source="hygiene-scanner",
                        severity="medium",
                        category="debug-enabled",
                        description="Debug mode appears to be enabled in configuration.",
                        recommendation="Ensure debug mode is disabled in production configurations.",
                        confidence="observed",
                        file=path,
                        line=line_num,
                        evidence=line.strip()[:200],
                    ))
                    break

    return findings
