from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.response import success
from app.db.session import get_db
from app.middleware.rate_limit import limiter
from app.schemas.auth import LoginRequest, RefreshRequest, RegisterRequest
from app.services.auth import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, data: LoginRequest, db: AsyncSession = Depends(get_db)):
    service = AuthService(db)
    tokens = await service.login(data)
    return success(data=tokens.model_dump(), message="Login successful")


@router.post("/register")
@limiter.limit("3/minute")
async def register(request: Request, data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    service = AuthService(db)
    tokens = await service.register(data)
    return success(data=tokens.model_dump(), message="Registration successful")


@router.post("/refresh")
@limiter.limit("10/minute")
async def refresh_token(request: Request, data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    service = AuthService(db)
    tokens = await service.refresh(data.refresh_token)
    return success(data=tokens.model_dump(), message="Token refreshed")
