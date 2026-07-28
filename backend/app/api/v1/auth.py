from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.core.response import success
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import GitHubCallbackRequest, RefreshRequest
from app.services.auth import AuthService

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
async def refresh_token(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
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
            "role": current_user.role.name,
        },
        message="Current user",
    )
