import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.dataset import Dataset
from app.models.user import User, UserRole
from app.repositories.base import BaseRepository
from app.storage.base import StorageBackend


class DatasetService:
    def __init__(self, db: AsyncSession, storage: StorageBackend):
        self.db = db
        self.repo = BaseRepository(Dataset, db)
        self.storage = storage

    async def create(
        self,
        name: str,
        user: User,
        description: str | None = None,
        file_data: bytes | None = None,
        file_name: str | None = None,
    ) -> Dataset:
        file_path = None
        record_count = None
        if file_data and file_name:
            safe_name = file_name.replace("/", "_").replace("\\", "_")
            folder = str(user.id)
            storage_path = f"datasets/{folder}/{uuid.uuid4()}_{safe_name}"
            file_path = await self.storage.save(storage_path, file_data)
            lines = file_data.count(b"\n")
            if not file_data.endswith(b"\n"):
                lines += 1
            record_count = lines or None

        dataset = Dataset(
            name=name,
            description=description,
            file_path=file_path,
            record_count=record_count,
            owner_id=user.id,
        )
        return await self.repo.create(dataset)

    async def get(self, dataset_id: uuid.UUID) -> Dataset:
        dataset = await self.repo.get_by_id(dataset_id)
        if not dataset:
            raise NotFoundError("Dataset not found")
        return dataset

    async def list_all(
        self,
        skip: int = 0,
        limit: int = 100,
    ) -> list[Dataset]:
        return await self.repo.get_all(skip, limit)

    async def delete(self, dataset_id: uuid.UUID, user: User) -> None:
        dataset = await self.get(dataset_id)

        if user.role != UserRole.ADMIN and (dataset.owner_id is None or dataset.owner_id != user.id):
            raise ForbiddenError("Only the dataset owner can delete this dataset")

        if dataset.file_path and await self.storage.exists(dataset.file_path):
            await self.storage.delete(dataset.file_path)

        await self.repo.delete(dataset)
