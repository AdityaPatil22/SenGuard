import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.dataset import Dataset
from app.models.user import User
from app.repositories.dataset import DatasetRepository
from app.services.project import ProjectService
from app.storage.base import StorageBackend


class DatasetService:
    def __init__(self, db: AsyncSession, storage: StorageBackend):
        self.db = db
        self.repo = DatasetRepository(db)
        self.storage = storage

    async def create(
        self,
        name: str,
        project_id: uuid.UUID,
        user: User,
        description: str | None = None,
        file_data: bytes | None = None,
        file_name: str | None = None,
    ) -> Dataset:
        project_svc = ProjectService(self.db)
        project = await project_svc.get(project_id)
        if user.role.name != "admin" and project.owner_id != user.id:
            raise ForbiddenError("Only the project owner or an admin can add datasets")

        file_path = None
        record_count = None
        if file_data and file_name:
            safe_name = file_name.replace("/", "_").replace("\\", "_")
            storage_path = f"datasets/{project_id}/{uuid.uuid4()}_{safe_name}"
            file_path = await self.storage.save(storage_path, file_data)
            record_count = file_data.count(b"\n") or None

        dataset = Dataset(
            name=name,
            description=description,
            file_path=file_path,
            record_count=record_count,
            project_id=project_id,
        )
        return await self.repo.create(dataset)

    async def get(self, dataset_id: uuid.UUID) -> Dataset:
        dataset = await self.repo.get_by_id(dataset_id)
        if not dataset:
            raise NotFoundError("Dataset not found")
        return dataset

    async def list_all(
        self,
        project_id: uuid.UUID | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> list[Dataset]:
        if project_id:
            return await self.repo.get_by_project(project_id, skip, limit)
        return await self.repo.get_all(skip, limit)

    async def delete(self, dataset_id: uuid.UUID, user: User) -> None:
        dataset = await self.get(dataset_id)
        project_svc = ProjectService(self.db)
        project = await project_svc.get(dataset.project_id)
        if user.role.name != "admin" and project.owner_id != user.id:
            raise ForbiddenError("Only the project owner or an admin can delete datasets")

        if dataset.file_path and await self.storage.exists(dataset.file_path):
            await self.storage.delete(dataset.file_path)

        await self.repo.delete(dataset)
