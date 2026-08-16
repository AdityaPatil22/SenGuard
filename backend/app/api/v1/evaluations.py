import asyncio
import json
import uuid

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.jwt import decode_token
from app.core.exceptions import BadRequestError, UnauthorizedError
from app.core.response import success
from app.db.session import async_session, get_db
from app.models.evaluation import EvaluationStatus
from app.models.user import User
from app.schemas.evaluation import EvaluationCreate
from app.services.audit import create_audit_log
from app.services.evaluation import EvaluationService
from app.services.evaluation_progress import EvaluationProgress, progress_store

router = APIRouter(prefix="/evaluations", tags=["evaluations"])


async def _run_evaluation_background(evaluation_id: str):
    progress = progress_store.get(evaluation_id)
    if not progress:
        return

    async with async_session() as session:
        try:
            service = EvaluationService(session)
            await service.run(uuid.UUID(evaluation_id))
            await session.commit()
            progress.complete()
        except Exception as e:
            await session.rollback()
            progress.fail(str(e))
        finally:
            await asyncio.sleep(60)
            progress_store.pop(evaluation_id, None)


def _serialize(evaluation) -> dict:
    return {
        "id": str(evaluation.id),
        "status": evaluation.status,
        "risk_score": evaluation.risk_score,
        "summary": evaluation.summary,
        "model_name": evaluation.model_name,
        "node_results": evaluation.node_results,
        "error_message": evaluation.error_message,
        "project_id": str(evaluation.project_id) if evaluation.project_id else None,
        "dataset_id": str(evaluation.dataset_id) if evaluation.dataset_id else None,
        "evaluation_type": "application"
        if evaluation.project_id
        else "dataset"
        if evaluation.dataset_id
        else "standalone",
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
    evaluation = await service.create(
        data.model_name,
        current_user.id,
        project_id=uuid.UUID(data.project_id) if data.project_id else None,
        dataset_id=uuid.UUID(data.dataset_id) if data.dataset_id else None,
    )
    return success(data=_serialize(evaluation), message="Evaluation created")


@router.get("")
async def list_evaluations(
    project_id: str | None = Query(None),
    status: str | None = Query(None),
    evaluation_type: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = EvaluationService(db)
    evaluations = await service.list_all(
        current_user,
        project_id=uuid.UUID(project_id) if project_id else None,
        status=status,
        evaluation_type=evaluation_type,
        skip=skip,
        limit=limit,
    )
    return success(data=[_serialize(e) for e in evaluations], message="Evaluations retrieved")


@router.get("/{evaluation_id}")
async def get_evaluation(
    evaluation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = EvaluationService(db)
    evaluation = await service.get_owned(uuid.UUID(evaluation_id), current_user)
    return success(data=_serialize(evaluation), message="Evaluation retrieved")


@router.post("/{evaluation_id}/run")
async def run_evaluation(
    evaluation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = EvaluationService(db)
    evaluation = await service.get_owned(uuid.UUID(evaluation_id), current_user)

    if evaluation.status == EvaluationStatus.RUNNING:
        return Response(
            content=json.dumps(
                success(data=_serialize(evaluation), message="Evaluation already running")
            ),
            media_type="application/json",
            status_code=202,
        )

    if evaluation.status in (EvaluationStatus.COMPLETED, EvaluationStatus.FAILED):
        raise BadRequestError("Evaluation already finished; create a new evaluation to re-run it")

    claimed = await service.repo.claim_for_run(evaluation.id)
    if claimed is None:
        # Lost the race to another concurrent request; report its outcome instead of re-running.
        evaluation = await service.get(uuid.UUID(evaluation_id))
        return Response(
            content=json.dumps(
                success(data=_serialize(evaluation), message="Evaluation already running")
            ),
            media_type="application/json",
            status_code=202,
        )
    evaluation = claimed

    await create_audit_log(
        db,
        action="evaluation_started",
        resource_type="evaluation",
        resource_id=evaluation_id,
        user_id=current_user.id,
    )

    progress = EvaluationProgress()
    progress_store[evaluation_id] = progress

    asyncio.create_task(_run_evaluation_background(evaluation_id))

    return Response(
        content=json.dumps(success(data=_serialize(evaluation), message="Evaluation started")),
        media_type="application/json",
        status_code=202,
    )


@router.get("/{evaluation_id}/status")
async def get_evaluation_status(
    evaluation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = EvaluationService(db)
    evaluation = await service.get_owned(uuid.UUID(evaluation_id), current_user)
    return success(
        data={"id": str(evaluation.id), "status": evaluation.status},
        message="Evaluation status",
    )


@router.get("/{evaluation_id}/stream")
async def stream_evaluation(
    evaluation_id: str,
    token: str = Query(...),
):
    try:
        decode_token(token, expected_type="access")
    except UnauthorizedError:
        return Response(
            content=json.dumps({"success": False, "message": "Unauthorized", "data": None}),
            media_type="application/json",
            status_code=401,
        )

    progress = progress_store.get(evaluation_id)

    async def event_generator():
        if not progress:
            yield f"data: {json.dumps({'type': 'evaluation:complete'})}\n\n"
            return

        async for event in progress.stream():
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
