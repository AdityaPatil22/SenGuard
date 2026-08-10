import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.dataset import Dataset
from app.models.evaluation import Evaluation
from app.models.project import Project, ProjectStatus
from app.models.report import Report
from app.models.user import User
from app.repositories.project import ProjectRepository


class ProjectService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = ProjectRepository(db)

    async def create(
        self, name: str, description: str | None, owner_id: uuid.UUID, *, repo_url: str | None = None
    ) -> Project:
        repo_full_name = None
        if repo_url:
            parts = repo_url.rstrip("/").split("/")
            if len(parts) >= 2:
                repo_full_name = f"{parts[-2]}/{parts[-1]}"

        project = Project(
            name=name,
            description=description,
            repo_url=repo_url,
            repo_full_name=repo_full_name,
            status=ProjectStatus.DRAFT,
            owner_id=owner_id,
        )
        return await self.repo.create(project)

    async def get(self, project_id: uuid.UUID) -> Project:
        project = await self.repo.get_by_id(project_id)
        if not project:
            raise NotFoundError("Project not found")
        return project

    async def list_all(
        self,
        user: User,
        skip: int = 0,
        limit: int = 100,
    ) -> list[Project]:
        return await self.repo.get_by_owner(user.id, skip, limit)

    async def update(
        self,
        project_id: uuid.UUID,
        user: User,
        data: dict,
    ) -> Project:
        project = await self.get(project_id)
        self._check_owner(project, user)
        return await self.repo.update(project, {k: v for k, v in data.items() if v is not None})

    async def delete(self, project_id: uuid.UUID, user: User) -> None:
        project = await self.get(project_id)
        self._check_owner(project, user)
        eval_ids = (
            (await self.db.execute(select(Evaluation.id).where(Evaluation.project_id == project_id))).scalars().all()
        )
        if eval_ids:
            await self.db.execute(delete(Report).where(Report.evaluation_id.in_(eval_ids)))
            await self.db.execute(delete(Evaluation).where(Evaluation.project_id == project_id))
        await self.repo.delete(project)

    def _check_owner(self, project: Project, user: User) -> None:
        if project.owner_id != user.id:
            raise ForbiddenError("Only the project owner can modify this project")
