from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_roles
from app.core.response import success
from app.db.session import get_db
from app.models.audit_log import AuditLog
from app.models.user import User
from app.repositories.audit_log import AuditLogRepository

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


def _serialize(log: AuditLog) -> dict:
    return {
        "id": str(log.id),
        "action": log.action,
        "resource_type": log.resource_type,
        "resource_id": log.resource_id,
        "details": log.details,
        "user_id": str(log.user_id) if log.user_id else None,
        "created_at": log.created_at.isoformat(),
    }


@router.get("")
async def list_audit_logs(
    resource_type: str | None = Query(None),
    user_id: uuid.UUID | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_roles("admin")),
):
    repo = AuditLogRepository(db)
    logs = await repo.query(
        resource_type=resource_type,
        user_id=user_id,
        skip=skip,
        limit=limit,
    )
    return success(data=[_serialize(log) for log in logs], message="Audit logs retrieved")
