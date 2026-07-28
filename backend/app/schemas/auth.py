from pydantic import BaseModel


class GitHubCallbackRequest(BaseModel):
    code: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    id: str
    github_username: str
    email: str | None
    avatar_url: str | None
    role: str
