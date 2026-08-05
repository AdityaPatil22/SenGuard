import uuid as _uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.auth.jwt import create_access_token, create_refresh_token
from app.config import get_settings
from app.db.session import get_db
from app.main import app
from app.models.user import User

settings = get_settings()


@pytest.fixture
async def db_session():
    engine = create_async_engine(settings.database_url, echo=False)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session
    await engine.dispose()


@pytest.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
async def auth_tokens(db_session):
    gid = _uuid.uuid4().int >> 65
    user = User(github_id=gid, github_username="testuser", email=f"test-{gid}@example.com")
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return {
        "access_token": create_access_token(str(user.id)),
        "refresh_token": create_refresh_token(str(user.id)),
        "user_id": str(user.id),
    }


@pytest.fixture
async def admin_user_tokens(db_session):
    gid = _uuid.uuid4().int >> 65
    user = User(
        github_id=gid,
        github_username="adminuser",
        email=f"admin-{gid}@example.com",
        role="admin",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return {
        "access_token": create_access_token(str(user.id)),
        "refresh_token": create_refresh_token(str(user.id)),
        "user_id": str(user.id),
    }
