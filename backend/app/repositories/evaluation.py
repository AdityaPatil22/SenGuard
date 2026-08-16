import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.evaluation import Evaluation, EvaluationStatus
from app.repositories.base import BaseRepository


class EvaluationRepository(BaseRepository[Evaluation]):
    def __init__(self, db: AsyncSession):
        super().__init__(Evaluation, db)

    async def claim_for_run(self, evaluation_id: uuid.UUID) -> Evaluation | None:
        """Atomically flip PENDING -> RUNNING. Returns None if another request already claimed it."""
        result = await self.db.execute(
            update(Evaluation)
            .where(Evaluation.id == evaluation_id, Evaluation.status == EvaluationStatus.PENDING)
            .values(status=EvaluationStatus.RUNNING)
            .returning(Evaluation)
        )
        await self.db.flush()
        return result.scalar_one_or_none()

    async def get_filtered(
        self,
        project_id: uuid.UUID | None = None,
        status: str | None = None,
        evaluation_type: str | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> list[Evaluation]:
        conditions = []
        if project_id:
            conditions.append(Evaluation.project_id == project_id)
        if status:
            conditions.append(Evaluation.status == status)
        if evaluation_type == "application":
            conditions.append(Evaluation.project_id.isnot(None))
        elif evaluation_type == "dataset":
            conditions.append(Evaluation.dataset_id.isnot(None))

        result = await self.db.execute(
            select(Evaluation)
            .where(*conditions)
            .order_by(Evaluation.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())
