import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.response import success
from app.db.session import async_session

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    return success(data={"status": "healthy"}, message="Service is running")


@router.get("/health/db")
async def db_health_check():
    try:
        async with async_session() as session:
            await session.execute(text("SELECT 1"))
        return success(data={"database": "connected"})
    except Exception:
        logger.exception("Database health check failed")
        return JSONResponse(
            status_code=503,
            content={"success": False, "message": "Database unavailable", "data": {"database": "disconnected"}},
        )
