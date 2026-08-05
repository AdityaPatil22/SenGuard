from __future__ import annotations

import logging
import uuid

from app.db.session import async_session
from app.services.audit import create_audit_log
from app.services.evaluation import EvaluationService

logger = logging.getLogger(__name__)


async def run_evaluation_background(evaluation_id: uuid.UUID, user_id: uuid.UUID | None = None) -> None:
    async with async_session() as session:
        try:
            service = EvaluationService(session)
            await service.run(evaluation_id)

            await create_audit_log(
                session,
                action="evaluation_completed",
                resource_type="evaluation",
                resource_id=str(evaluation_id),
                user_id=user_id,
            )
            await session.commit()
        except Exception:
            await session.rollback()
            logger.exception("Background evaluation failed: %s", evaluation_id)
