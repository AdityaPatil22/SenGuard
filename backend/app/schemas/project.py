from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    repo_url: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    repo_url: str | None = None
