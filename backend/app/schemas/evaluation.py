from pydantic import BaseModel


class EvaluationCreate(BaseModel):
    project_id: str | None = None
    dataset_id: str | None = None
    mcp_server_id: str | None = None
    skill_id: str | None = None
    model_name: str | None = None
