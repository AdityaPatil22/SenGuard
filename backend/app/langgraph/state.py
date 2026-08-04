from typing import Any, TypedDict


class EvaluationState(TypedDict, total=False):
    # Inputs
    project_id: str
    project_name: str
    project_description: str
    model_name: str | None
    dataset_samples: list[str]
    repo_files: list[dict[str, str]]
    repo_path: str | None

    # Phase 1: deterministic scan results
    scanner_results: dict[str, Any]

    # Phase 2: LLM analysis
    llm_analysis_result: dict[str, Any]
    risk_score: float | None
    risk_breakdown: dict[str, Any] | None
    report: str | None
    error: str | None
    errors: list[str]
