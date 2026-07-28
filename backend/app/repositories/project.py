import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.repositories.base import BaseRepository


class ProjectRepository(BaseRepository[Project]):
    def __init__(self, db: AsyncSession):
        super().__init__(Project, db)

    async def get_by_owner(self, owner_id: uuid.UUID, skip: int = 0, limit: int = 100) -> list[Project]:
        result = await self.db.execute(
            select(Project)
            .where(Project.owner_id == owner_id)
            .order_by(Project.created_at.desc())
            .offset(skip).limit(limit)
        )
        return list(result.scalars().all())
