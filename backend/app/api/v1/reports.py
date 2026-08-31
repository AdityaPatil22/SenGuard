import json
import uuid

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_roles
from app.core.response import success
from app.db.session import get_db
from app.models.user import User
from app.schemas.report import ReportReject
from app.services.report import ReportService, _serialize

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("")
async def list_reports(
    project_id: str | None = Query(None),
    status: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    service = ReportService(db)
    reports = await service.list_all(
        project_id=uuid.UUID(project_id) if project_id else None,
        status=status,
        skip=skip,
        limit=limit,
    )
    return success(data=[_serialize(r) for r in reports], message="Reports retrieved")


@router.get("/{report_id}")
async def get_report(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    service = ReportService(db)
    report = await service.get(report_id)
    return success(data=_serialize(report), message="Report retrieved")


@router.post("/{report_id}/approve")
async def approve_report(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("reviewer", "admin")),
):
    service = ReportService(db)
    report = await service.approve(report_id, current_user.id)
    return success(data=_serialize(report), message="Report approved")


@router.post("/{report_id}/reject")
async def reject_report(
    report_id: uuid.UUID,
    data: ReportReject,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("reviewer", "admin")),
):
    service = ReportService(db)
    report = await service.reject(report_id, current_user.id, data.comment)
    return success(data=_serialize(report), message="Report rejected")


@router.get("/{report_id}/export")
async def export_report(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    service = ReportService(db)
    report_data = await service.export_json(report_id)
    return Response(
        content=json.dumps(report_data),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="report-{str(report_id)[:8]}.json"'},
    )
