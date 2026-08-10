import httpx
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.core.exceptions import BadRequestError
from app.core.response import success
from app.db.session import get_db
from app.middleware.rate_limit import limiter
from app.models.user import User
from app.schemas.auth import GitHubCallbackRequest, RefreshRequest
from app.services.auth import AuthService, decrypt_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/github")
async def github_login():
    url = AuthService.github_auth_url()
    return success(data={"url": url}, message="Redirect to GitHub")


@router.post("/github/callback")
async def github_callback(data: GitHubCallbackRequest, db: AsyncSession = Depends(get_db)):
    service = AuthService(db)
    result = await service.github_callback(data.code)
    return success(data=result, message="Authentication successful")


@router.post("/refresh")
@limiter.limit("10/minute")
async def refresh_token(request: Request, data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    service = AuthService(db)
    tokens = await service.refresh(data.refresh_token)
    return success(data=tokens.model_dump(), message="Token refreshed")


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return success(
        data={
            "id": str(current_user.id),
            "github_username": current_user.github_username,
            "email": current_user.email,
            "avatar_url": current_user.avatar_url,
            "role": current_user.role or "developer",
            "is_active": current_user.is_active,
            "created_at": current_user.created_at.isoformat(),
            "updated_at": current_user.updated_at.isoformat(),
        },
        message="Current user",
    )


@router.get("/github/repos")
async def list_github_repos(
    per_page: int = Query(30, ge=1, le=100),
    page: int = Query(1, ge=1),
    current_user: User = Depends(get_current_user),
):
    if not current_user.github_token:
        raise BadRequestError("No GitHub token — please re-login")

    gh_token = decrypt_token(current_user.github_token)

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.github.com/user/repos",
            params={"sort": "updated", "per_page": per_page, "page": page, "type": "owner"},
            headers={
                "Authorization": f"Bearer {gh_token}",
                "Accept": "application/json",
            },
        )
        resp.raise_for_status()

    repos = [
        {
            "full_name": r["full_name"],
            "name": r["name"],
            "description": r.get("description"),
            "private": r["private"],
            "language": r.get("language"),
            "html_url": r["html_url"],
        }
        for r in resp.json()
    ]
    return success(data=repos, message="GitHub repositories")