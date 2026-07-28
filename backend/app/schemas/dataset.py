from pydantic import BaseModel


class DatasetCreate(BaseModel):
    name: str
    description: str | None = None
    project_id: str


class DatasetResponse(BaseModel):
    id: str
    name: str
    description: str | None
    file_path: str | None
    record_count: int | None
    project_id: str
    created_at: str
    updated_at: str
