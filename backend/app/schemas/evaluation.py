from pydantic import BaseModel


class EvaluationCreate(BaseModel):
    project_id: str | None = None
    dataset_id: str | None = None
    model_name: str | None = None
