import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.skill import Skill
from app.models.user import User, UserRole
from app.repositories.skill import SkillRepository
from app.storage.base import StorageBackend


class SkillService:
    def __init__(self, db: AsyncSession, storage: StorageBackend | None = None):
        self.db = db
        self.repo = SkillRepository(db)
        self.storage = storage

    async def create(
        self,
        name: str,
        skill_type: str,
        owner_id: uuid.UUID,
        description: str | None = None,
        content: str | None = None,
        file_data: bytes | None = None,
        file_name: str | None = None,
    ) -> Skill:
        file_path = None
        if file_data and file_name and self.storage:
            safe_name = file_name.replace("/", "_").replace("\\", "_")
            storage_path = f"skills/{owner_id}/{uuid.uuid4()}_{safe_name}"
            file_path = await self.storage.save(storage_path, file_data)

        skill = Skill(
            name=name,
            description=description,
            skill_type=skill_type,
            content=content,
            file_path=file_path,
            owner_id=owner_id,
        )
        return await self.repo.create(skill)

    async def get(self, skill_id: uuid.UUID) -> Skill:
        skill = await self.repo.get_by_id(skill_id)
        if not skill:
            raise NotFoundError("Skill not found")
        return skill

    async def list_all(self, skip: int = 0, limit: int = 100) -> list[Skill]:
        return await self.repo.get_all(skip, limit)

    async def update(
        self, skill_id: uuid.UUID, user: User, data: dict
    ) -> Skill:
        skill = await self.get(skill_id)
        if user.role != UserRole.ADMIN and skill.owner_id != user.id:
            raise ForbiddenError("Not authorized to update this skill")
        return await self.repo.update(skill, data)

    async def delete(self, skill_id: uuid.UUID, user: User) -> None:
        skill = await self.get(skill_id)
        if user.role != UserRole.ADMIN and skill.owner_id != user.id:
            raise ForbiddenError("Not authorized to delete this skill")
        if skill.file_path and self.storage and await self.storage.exists(skill.file_path):
            await self.storage.delete(skill.file_path)
        await self.repo.delete(skill)
