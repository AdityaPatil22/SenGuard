import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.user import User
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    def __init__(self, db: AsyncSession):
        super().__init__(User, db)

    async def get_by_github_id(self, github_id: int) -> User | None:
        result = await self.db.execute(
            select(User).options(selectinload(User.role)).where(User.github_id == github_id)
        )
        return result.scalar_one_or_none()

    async def get_by_id_with_role(self, id: uuid.UUID) -> User | None:
        result = await self.db.execute(select(User).options(selectinload(User.role)).where(User.id == id))
        return result.scalar_one_or_none()
