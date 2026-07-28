import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.core.response import success
from app.db.session import get_db
from app.models.user import User
from app.schemas.evaluation import EvaluationCreate
from app.services.evaluation import EvaluationService

router = APIRouter(prefix="/evaluations", tags=["evaluations"])


def _serialize(evaluation) -> dict:
    return {
        "id": str(evaluation.id),
        "status": evaluation.status,
        "risk_score": evaluation.risk_score,
        "summary": evaluation.summary,
        "model_name": evaluation.model_name,
        "node_results": evaluation.node_results,
        "error_message": evaluation.error_message,
        "project_id": str(evaluation.project_id),
        "created_at": evaluation.created_at.isoformat(),
        "updated_at": evaluation.updated_at.isoformat(),
    }


@router.post("")
async def create_evaluation(
    data: EvaluationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = EvaluationService(db)
    evaluation = await service.create(uuid.UUID(data.project_id), data.model_name, current_user.id)
    return success(data=_serialize(evaluation), message="Evaluation created")


@router.get("")
async def list_evaluations(
    project_id: str | None = Query(None),
    status: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    service = EvaluationService(db)
    evaluations = await service.list_all(
        project_id=uuid.UUID(project_id) if project_id else None,
        status=status,
        skip=skip,
        limit=limit,
    )
    return success(data=[_serialize(e) for e in evaluations], message="Evaluations retrieved")


@router.get("/{evaluation_id}")
async def get_evaluation(
    evaluation_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    service = EvaluationService(db)
    evaluation = await service.get(uuid.UUID(evaluation_id))
    return success(data=_serialize(evaluation), message="Evaluation retrieved")


@router.post("/{evaluation_id}/run")
async def run_evaluation(
    evaluation_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    service = EvaluationService(db)
    evaluation = await service.run(uuid.UUID(evaluation_id))
    return success(data=_serialize(evaluation), message="Evaluation completed")


@router.get("/{evaluation_id}/status")
async def get_evaluation_status(
    evaluation_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    service = EvaluationService(db)
    evaluation = await service.get(uuid.UUID(evaluation_id))
    return success(
        data={"id": str(evaluation.id), "status": evaluation.status},
        message="Evaluation status",
    )
