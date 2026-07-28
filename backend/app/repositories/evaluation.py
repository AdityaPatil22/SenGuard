import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.evaluation import Evaluation
from app.repositories.base import BaseRepository


class EvaluationRepository(BaseRepository[Evaluation]):
    def __init__(self, db: AsyncSession):
        super().__init__(Evaluation, db)

    async def get_by_project(self, project_id: uuid.UUID, skip: int = 0, limit: int = 100) -> list[Evaluation]:
        result = await self.db.execute(
            select(Evaluation)
            .where(Evaluation.project_id == project_id)
            .order_by(Evaluation.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_by_status(self, status: str, skip: int = 0, limit: int = 100) -> list[Evaluation]:
        result = await self.db.execute(
            select(Evaluation)
            .where(Evaluation.status == status)
            .order_by(Evaluation.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())
