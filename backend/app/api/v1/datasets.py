import uuid

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.config.settings import get_settings
from app.core.response import success
from app.db.session import get_db
from app.models.user import User
from app.services.dataset import DatasetService
from app.storage.base import get_storage

router = APIRouter(prefix="/datasets", tags=["datasets"])


def _serialize(dataset) -> dict:
    return {
        "id": str(dataset.id),
        "name": dataset.name,
        "description": dataset.description,
        "file_path": dataset.file_path,
        "record_count": dataset.record_count,
        "project_id": str(dataset.project_id),
        "created_at": dataset.created_at.isoformat(),
        "updated_at": dataset.updated_at.isoformat(),
    }


def _get_storage():
    settings = get_settings()
    return get_storage(settings.storage_backend, base_path=settings.storage_local_path)


@router.post("")
async def create_dataset(
    name: str = Form(...),
    project_id: str = Form(...),
    description: str | None = Form(None),
    file: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    storage = _get_storage()
    service = DatasetService(db, storage)
    file_data = await file.read() if file else None
    file_name = file.filename if file else None
    dataset = await service.create(
        name=name,
        project_id=uuid.UUID(project_id),
        user=current_user,
        description=description,
        file_data=file_data,
        file_name=file_name,
    )
    return success(data=_serialize(dataset), message="Dataset created")


@router.get("")
async def list_datasets(
    project_id: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    storage = _get_storage()
    service = DatasetService(db, storage)
    datasets = await service.list_all(
        project_id=uuid.UUID(project_id) if project_id else None,
        skip=skip,
        limit=limit,
    )
    return success(data=[_serialize(d) for d in datasets], message="Datasets retrieved")


@router.get("/{dataset_id}")
async def get_dataset(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    storage = _get_storage()
    service = DatasetService(db, storage)
    dataset = await service.get(uuid.UUID(dataset_id))
    return success(data=_serialize(dataset), message="Dataset retrieved")


@router.delete("/{dataset_id}")
async def delete_dataset(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    storage = _get_storage()
    service = DatasetService(db, storage)
    await service.delete(uuid.UUID(dataset_id), current_user)
    return success(message="Dataset deleted")
