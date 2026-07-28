import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.project import Project, ProjectStatus
from app.models.user import User
from app.repositories.project import ProjectRepository


class ProjectService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = ProjectRepository(db)

    async def create(self, name: str, description: str | None, owner_id: uuid.UUID) -> Project:
        project = Project(
            name=name,
            description=description,
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
        if user.role.name == "admin":
            return await self.repo.get_all(skip, limit)
        return await self.repo.get_by_owner(user.id, skip, limit)

    async def update(
        self,
        project_id: uuid.UUID,
        user: User,
        data: dict,
    ) -> Project:
        project = await self.get(project_id)
        self._check_owner_or_admin(project, user)
        return await self.repo.update(project, {k: v for k, v in data.items() if v is not None})

    async def delete(self, project_id: uuid.UUID, user: User) -> None:
        project = await self.get(project_id)
        if user.role.name != "admin" and project.owner_id != user.id:
            raise ForbiddenError("Only the owner or an admin can delete this project")
        await self.repo.delete(project)

    def _check_owner_or_admin(self, project: Project, user: User) -> None:
        if user.role.name != "admin" and project.owner_id != user.id:
            raise ForbiddenError("Only the owner or an admin can modify this project")
