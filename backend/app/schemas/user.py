from pydantic import BaseModel


class UserResponse(BaseModel):
    id: str
    github_username: str
    email: str | None
    avatar_url: str | None
    role: str
    is_active: bool
    created_at: str
    updated_at: str


class UserRoleUpdate(BaseModel):
    role: str
