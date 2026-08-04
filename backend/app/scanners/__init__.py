from __future__ import annotations

import logging
from dataclasses import asdict, dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


@dataclass
class Finding:
    source: str
    severity: str  # low | medium | high | critical
    category: str
    description: str
    recommendation: str
    confidence: str = "observed"  # verified | observed | potential-risk
    file: str | None = None
    line: int | None = None
    evidence: str | None = None

    def to_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class ScanResults:
    findings: list[Finding] = field(default_factory=list)
    scanners_used: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "findings": [f.to_dict() for f in self.findings],
            "scanners_used": self.scanners_used,
            "errors": self.errors,
            "summary": {
                "total": len(self.findings),
                "critical": sum(1 for f in self.findings if f.severity == "critical"),
                "high": sum(1 for f in self.findings if f.severity == "high"),
                "medium": sum(1 for f in self.findings if f.severity == "medium"),
                "low": sum(1 for f in self.findings if f.severity == "low"),
            },
        }


SEVERITY_WEIGHTS = {
    "critical": 25,
    "high": 15,
    "medium": 8,
    "low": 3,
}


def compute_base_risk_score(findings: list[Finding]) -> float:
    raw = sum(SEVERITY_WEIGHTS.get(f.severity, 0) for f in findings)
    return min(raw, 100.0)


async def run_all_scanners(
    repo_files: list[dict[str, str]],
    dataset_samples: list[str],
    repo_path: str | None = None,
) -> ScanResults:
    from app.scanners.code_patterns import scan_code_patterns
    from app.scanners.dependencies import scan_dependencies
    from app.scanners.file_hygiene import scan_file_hygiene
    from app.scanners.llm_patterns import scan_llm_patterns
    from app.scanners.pii import scan_pii
    from app.scanners.secrets import scan_secrets

    results = ScanResults()

    scanners = [
        ("secrets", lambda: scan_secrets(repo_files, repo_path)),
        ("code-patterns", lambda: scan_code_patterns(repo_files)),
        ("pii", lambda: scan_pii(dataset_samples)),
        ("dependencies", lambda: scan_dependencies(repo_files)),
        ("llm-patterns", lambda: scan_llm_patterns(repo_files)),
        ("file-hygiene", lambda: scan_file_hygiene(repo_files)),
    ]

    for name, scanner in scanners:
        try:
            findings = await scanner()
            results.findings.extend(findings)
            results.scanners_used.append(name)
        except Exception as e:
            logger.exception("Scanner %s failed", name)
            results.errors.append(f"{name}: {e}")

    return results
