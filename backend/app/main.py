from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import select

from app.api.v1 import router as v1_router
from app.config import get_settings
from app.core.exceptions import AppError
from app.core.logging import setup_logging
from app.db.base import Base
from app.db.session import async_session, engine
from app.middleware.error_handler import app_exception_handler, unhandled_exception_handler
from app.middleware.rate_limit import limiter
from app.models.user import Role, RoleEnum

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    setup_logging("DEBUG" if settings.app_debug else "INFO")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_session() as db:
        for role_name in RoleEnum:
            exists = (await db.execute(select(Role).where(Role.name == role_name))).scalar_one_or_none()
            if not exists:
                db.add(Role(name=role_name, description=f"{role_name.value} role"))
        await db.commit()
    yield


app = FastAPI(
    title="Sentinel AI",
    description="AI Governance Platform",
    version="0.1.0",
    lifespan=lifespan,
    default_response_class=ORJSONResponse,
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_exception_handler(AppError, app_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(v1_router, prefix="/api")
