from typing import Any

from pydantic import BaseModel


class EvaluationCreate(BaseModel):
    project_id: str | None = None
    dataset_id: str | None = None
    model_name: str | None = None
    auto_run: bool = False


class EvaluationResponse(BaseModel):
    id: str
    status: str
    risk_score: float | None
    summary: str | None
    model_name: str | None
    node_results: dict[str, Any] | None
    error_message: str | None
    project_id: str | None
    dataset_id: str | None
    created_at: str
    updated_at: str
