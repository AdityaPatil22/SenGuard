import uuid

from pydantic import BaseModel


class EvaluationCreate(BaseModel):
    project_id: uuid.UUID | None = None
    dataset_id: uuid.UUID | None = None
    mcp_server_id: uuid.UUID | None = None
    skill_id: uuid.UUID | None = None
    model_name: str | None = None
