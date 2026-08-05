from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, NotFoundError
from app.models.user import User, UserRole
from app.repositories.user import UserRepository
from app.services.audit import create_audit_log


class UserService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = UserRepository(db)

    async def list_users(self, skip: int = 0, limit: int = 100) -> list[User]:
        return await self.repo.get_all(skip, limit)

    async def get_user(self, user_id: uuid.UUID) -> User:
        user = await self.repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")
        return user

    async def change_role(self, user_id: uuid.UUID, new_role: str, acting_user: User) -> User:
        if user_id == acting_user.id:
            raise BadRequestError("Cannot change your own role")

        try:
            UserRole(new_role)
        except ValueError:
            raise BadRequestError(f"Invalid role: {new_role}")

        user = await self.get_user(user_id)
        await self.repo.update(user, {"role": new_role})

        await create_audit_log(
            self.db,
            action="change_role",
            resource_type="user",
            resource_id=str(user_id),
            user_id=acting_user.id,
            details=f"Changed role to {new_role}",
        )
        return user

    async def deactivate(self, user_id: uuid.UUID, acting_user: User) -> User:
        if user_id == acting_user.id:
            raise BadRequestError("Cannot deactivate yourself")

        user = await self.get_user(user_id)
        await self.repo.update(user, {"is_active": False})

        await create_audit_log(
            self.db,
            action="deactivate_user",
            resource_type="user",
            resource_id=str(user_id),
            user_id=acting_user.id,
        )
        return user
