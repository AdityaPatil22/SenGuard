import uuid

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dataset import Dataset
from app.models.evaluation import Evaluation, EvaluationStatus
from app.models.mcp_server import McpServer
from app.models.project import Project
from app.models.skill import Skill
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
        owner_id: uuid.UUID | None = None,
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
        elif evaluation_type == "mcp_server":
            conditions.append(Evaluation.mcp_server_id.isnot(None))
        elif evaluation_type == "skill":
            conditions.append(Evaluation.skill_id.isnot(None))

        query = select(Evaluation)
        if owner_id is not None:
            query = (
                query.outerjoin(Project, Evaluation.project_id == Project.id)
                .outerjoin(Dataset, Evaluation.dataset_id == Dataset.id)
                .outerjoin(McpServer, Evaluation.mcp_server_id == McpServer.id)
                .outerjoin(Skill, Evaluation.skill_id == Skill.id)
            )
            conditions.append(
                or_(
                    Project.owner_id == owner_id,
                    Dataset.owner_id == owner_id,
                    McpServer.owner_id == owner_id,
                    Skill.owner_id == owner_id,
                )
            )

        result = await self.db.execute(
            query.where(*conditions).order_by(Evaluation.created_at.desc()).offset(skip).limit(limit)
        )
        return list(result.scalars().all())
