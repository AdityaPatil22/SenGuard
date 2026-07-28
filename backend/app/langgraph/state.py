from typing import Any, TypedDict


class EvaluationState(TypedDict, total=False):
    project_id: str
    project_name: str
    project_description: str
    model_name: str | None
    dataset_samples: list[str]
    repo_files: list[dict[str, str]]

    prompt_security_result: dict[str, Any]
    dataset_validation_result: dict[str, Any]
    model_evaluation_result: dict[str, Any]
    risk_score: float | None
    report: str | None
    error: str | None
