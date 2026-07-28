from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text

from app.api.v1 import router as v1_router
from app.config import get_settings
from app.core.exceptions import AppError
from app.core.logging import setup_logging
from app.db.base import Base
from app.db.session import engine
from app.middleware.error_handler import app_exception_handler, unhandled_exception_handler
from app.middleware.rate_limit import limiter

settings = get_settings()


def _sync_schema(conn):
    """ponytail: sync columns + enum values to match models; swap for Alembic when needed"""
    from sqlalchemy import Enum as SAEnum
    from sqlalchemy import inspect as sa_inspect

    inspector = sa_inspect(conn)

    # add missing enum values
    for table in Base.metadata.tables.values():
        for col in table.columns:
            if not isinstance(col.type, SAEnum) or not col.type.enums:
                continue
            pg_type_name = col.type.name or f"{table.name}_{col.name}"
            existing = {
                row[0]
                for row in conn.execute(
                    text("SELECT unnest(enum_range(NULL::{}))::text".format(pg_type_name))
                )
            }
            for val in col.type.enums:
                if val not in existing:
                    conn.execute(text(f"ALTER TYPE {pg_type_name} ADD VALUE IF NOT EXISTS '{val}'"))

    # add missing columns
    for table_name, table in Base.metadata.tables.items():
        if not inspector.has_table(table_name):
            continue
        existing = {c["name"] for c in inspector.get_columns(table_name)}
        for col in table.columns:
            if col.name in existing:
                continue
            col_type = col.type.compile(conn.dialect)
            conn.execute(text(f'ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS "{col.name}" {col_type}'))


@asynccontextmanager
async def lifespan(_app: FastAPI):
    setup_logging("DEBUG" if settings.app_debug else "INFO")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_sync_schema)
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
