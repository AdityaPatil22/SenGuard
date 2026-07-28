import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.core.response import success
from app.db.session import get_db
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.services.project import ProjectService

router = APIRouter(prefix="/projects", tags=["projects"])


def _serialize(project) -> dict:
    return {
        "id": str(project.id),
        "name": project.name,
        "description": project.description,
        "status": project.status,
        "owner_id": str(project.owner_id),
        "created_at": project.created_at.isoformat(),
        "updated_at": project.updated_at.isoformat(),
    }


@router.post("")
async def create_project(
    data: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = ProjectService(db)
    project = await service.create(data.name, data.description, current_user.id)
    return success(data=_serialize(project), message="Project created")


@router.get("")
async def list_projects(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = ProjectService(db)
    projects = await service.list_all(current_user, skip, limit)
    return success(data=[_serialize(p) for p in projects], message="Projects retrieved")


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    service = ProjectService(db)
    project = await service.get(uuid.UUID(project_id))
    return success(data=_serialize(project), message="Project retrieved")


@router.put("/{project_id}")
async def update_project(
    project_id: str,
    data: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = ProjectService(db)
    project = await service.update(
        uuid.UUID(project_id),
        current_user,
        data.model_dump(exclude_unset=True),
    )
    return success(data=_serialize(project), message="Project updated")


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = ProjectService(db)
    await service.delete(uuid.UUID(project_id), current_user)
    return success(message="Project deleted")
