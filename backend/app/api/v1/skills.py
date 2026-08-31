import uuid

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.core.exceptions import BadRequestError
from app.core.response import success
from app.db.session import get_db
from app.models.user import User
from app.services.skill import SkillService
from app.storage.base import get_storage_from_settings

router = APIRouter(prefix="/skills", tags=["skills"])

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


def _serialize(skill) -> dict:
    return {
        "id": str(skill.id),
        "name": skill.name,
        "description": skill.description,
        "skill_type": skill.skill_type,
        "content": skill.content,
        "file_path": skill.file_path,
        "owner_id": str(skill.owner_id),
        "created_at": skill.created_at.isoformat(),
        "updated_at": skill.updated_at.isoformat(),
    }


@router.post("")
async def create_skill(
    name: str = Form(...),
    skill_type: str = Form(...),
    description: str | None = Form(None),
    content: str | None = Form(None),
    file: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if skill_type not in ("prompt", "agent", "plugin"):
        raise BadRequestError("skill_type must be one of: prompt, agent, plugin")
    storage = get_storage_from_settings()
    service = SkillService(db, storage)
    file_data = await file.read() if file else None
    if file_data and len(file_data) > MAX_FILE_SIZE:
        raise BadRequestError(f"File too large (max {MAX_FILE_SIZE // 1024 // 1024}MB)")
    file_name = file.filename if file else None
    skill = await service.create(
        name=name,
        skill_type=skill_type,
        owner_id=current_user.id,
        description=description,
        content=content,
        file_data=file_data,
        file_name=file_name,
    )
    return success(data=_serialize(skill), message="Skill created")


@router.get("")
async def list_skills(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    service = SkillService(db)
    skills = await service.list_all(skip, limit)
    return success(data=[_serialize(s) for s in skills], message="Skills retrieved")


@router.get("/{skill_id}")
async def get_skill(
    skill_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    service = SkillService(db)
    skill = await service.get(skill_id)
    return success(data=_serialize(skill), message="Skill retrieved")


@router.put("/{skill_id}")
async def update_skill(
    skill_id: uuid.UUID,
    name: str | None = Form(None),
    description: str | None = Form(None),
    content: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = SkillService(db)
    update_data = {}
    if name is not None:
        update_data["name"] = name
    if description is not None:
        update_data["description"] = description
    if content is not None:
        update_data["content"] = content
    skill = await service.update(skill_id, current_user, update_data)
    return success(data=_serialize(skill), message="Skill updated")


@router.delete("/{skill_id}")
async def delete_skill(
    skill_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    storage = get_storage_from_settings()
    service = SkillService(db, storage)
    await service.delete(skill_id, current_user)
    return success(message="Skill deleted")
