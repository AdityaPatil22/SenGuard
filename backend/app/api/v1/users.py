from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_roles
from app.core.response import success
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import UserRoleUpdate
from app.services.user import UserService

router = APIRouter(prefix="/users", tags=["users"])


def _serialize(user: User) -> dict:
    return {
        "id": str(user.id),
        "github_username": user.github_username,
        "email": user.email,
        "avatar_url": user.avatar_url,
        "role": user.role or "developer",
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat(),
        "updated_at": user.updated_at.isoformat(),
    }


@router.get("")
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_roles("admin")),
):
    service = UserService(db)
    users = await service.list_users(skip, limit)
    return success(data=[_serialize(u) for u in users], message="Users retrieved")


@router.get("/{user_id}")
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_roles("admin")),
):
    service = UserService(db)
    user = await service.get_user(uuid.UUID(user_id))
    return success(data=_serialize(user), message="User retrieved")


@router.patch("/{user_id}/role")
async def change_user_role(
    user_id: str,
    data: UserRoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    service = UserService(db)
    user = await service.change_role(uuid.UUID(user_id), data.role, current_user)
    return success(data=_serialize(user), message="Role updated")


@router.patch("/{user_id}/deactivate")
async def deactivate_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    service = UserService(db)
    user = await service.deactivate(uuid.UUID(user_id), current_user)
    return success(data=_serialize(user), message="User deactivated")
