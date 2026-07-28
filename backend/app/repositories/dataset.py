import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dataset import Dataset
from app.repositories.base import BaseRepository


class DatasetRepository(BaseRepository[Dataset]):
    def __init__(self, db: AsyncSession):
        super().__init__(Dataset, db)

    async def get_by_project(self, project_id: uuid.UUID, skip: int = 0, limit: int = 100) -> list[Dataset]:
        result = await self.db.execute(
            select(Dataset)
            .where(Dataset.project_id == project_id)
            .order_by(Dataset.created_at.desc())
            .offset(skip).limit(limit)
        )
        return list(result.scalars().all())
