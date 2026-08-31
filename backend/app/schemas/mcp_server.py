from pydantic import BaseModel


class McpServerCreate(BaseModel):
    name: str
    description: str | None = None
    manifest: dict | None = None
    repo_url: str | None = None


class McpServerUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    manifest: dict | None = None
    repo_url: str | None = None
