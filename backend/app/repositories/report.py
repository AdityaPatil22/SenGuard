import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.evaluation import Evaluation
from app.models.report import Report
from app.repositories.base import BaseRepository


class ReportRepository(BaseRepository[Report]):
    def __init__(self, db: AsyncSession):
        super().__init__(Report, db)

    async def get_with_evaluation(self, report_id: uuid.UUID) -> Report | None:
        result = await self.db.execute(
            select(Report)
            .options(joinedload(Report.evaluation).joinedload(Evaluation.project))
            .where(Report.id == report_id)
        )
        return result.unique().scalar_one_or_none()

    async def get_by_status(self, status: str, skip: int = 0, limit: int = 100) -> list[Report]:
        result = await self.db.execute(
            select(Report)
            .options(joinedload(Report.evaluation).joinedload(Evaluation.project))
            .where(Report.status == status)
            .order_by(Report.created_at.desc())
            .offset(skip).limit(limit)
        )
        return list(result.unique().scalars().all())

    async def get_by_project(self, project_id: uuid.UUID, skip: int = 0, limit: int = 100) -> list[Report]:
        result = await self.db.execute(
            select(Report)
            .options(joinedload(Report.evaluation).joinedload(Evaluation.project))
            .join(Evaluation)
            .where(Evaluation.project_id == project_id)
            .order_by(Report.created_at.desc())
            .offset(skip).limit(limit)
        )
        return list(result.unique().scalars().all())

    async def list_all_with_evaluation(self, skip: int = 0, limit: int = 100) -> list[Report]:
        result = await self.db.execute(
            select(Report)
            .options(joinedload(Report.evaluation).joinedload(Evaluation.project))
            .order_by(Report.created_at.desc())
            .offset(skip).limit(limit)
        )
        return list(result.unique().scalars().all())
