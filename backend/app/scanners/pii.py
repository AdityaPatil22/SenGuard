from __future__ import annotations

import re

from app.scanners import Finding

PII_PATTERNS: list[tuple[str, re.Pattern, str, str]] = [
    (
        "email",
        re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z]{2,}"),
        "Email address detected in dataset.",
        "Remove or anonymize email addresses before training.",
    ),
    (
        "phone-us",
        re.compile(r"(?<!\d)(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?!\d)"),
        "US phone number pattern detected in dataset.",
        "Remove or mask phone numbers.",
    ),
    (
        "ssn",
        re.compile(r"(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)"),
        "Social Security Number pattern detected in dataset.",
        "Remove SSNs immediately — this is highly sensitive PII.",
    ),
    (
        "credit-card",
        re.compile(
            r"(?<!\d)(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{1,4}(?!\d)"
        ),
        "Credit card number pattern detected in dataset.",
        "Remove credit card numbers — PCI DSS violation.",
    ),
    (
        "ip-address",
        re.compile(r"(?<!\d)(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)(?!\d)"),
        "IP address detected in dataset.",
        "Consider anonymizing IP addresses.",
    ),
]

SEVERITY_MAP = {
    "ssn": "critical",
    "credit-card": "critical",
    "email": "medium",
    "phone-us": "medium",
    "ip-address": "low",
}

CONFIDENCE_MAP = {
    "ssn": "verified",
    "credit-card": "verified",
    "email": "observed",
    "phone-us": "observed",
    "ip-address": "observed",
}


async def scan_pii(dataset_samples: list[str]) -> list[Finding]:
    if not dataset_samples:
        return []

    findings = []
    seen: set[tuple[str, int]] = set()

    for line_num, line in enumerate(dataset_samples, 1):
        for name, pattern, desc, rec in PII_PATTERNS:
            matches = pattern.findall(line)
            if matches and (name, line_num) not in seen:
                seen.add((name, line_num))
                match_text = matches[0] if isinstance(matches[0], str) else str(matches[0])
                # Partially mask the evidence
                masked = match_text[:3] + "***" + match_text[-2:] if len(match_text) > 5 else "***"
                findings.append(
                    Finding(
                        source="pii-scanner",
                        severity=SEVERITY_MAP.get(name, "medium"),
                        category=f"pii-{name}",
                        description=desc,
                        recommendation=rec,
                        confidence=CONFIDENCE_MAP.get(name, "observed"),
                        file="dataset",
                        line=line_num,
                        evidence=f"Matched: {masked}",
                    )
                )

    return findings
