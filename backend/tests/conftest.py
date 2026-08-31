import uuid as _uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.auth.jwt import create_access_token, create_refresh_token
from app.config import get_settings
from app.db.session import get_db
from app.main import app
from app.models.dataset import Dataset
from app.models.evaluation import Evaluation, EvaluationStatus
from app.models.mcp_server import McpServer
from app.models.project import Project, ProjectStatus
from app.models.report import Report, ReportStatus
from app.models.skill import Skill
from app.models.user import User

settings = get_settings()

_test_engine = create_async_engine(settings.database_url, echo=False, poolclass=NullPool)


def _make_gid() -> int:
    return _uuid.uuid4().int >> 65


@pytest.fixture
async def db_session():
    async with _test_engine.connect() as conn:
        txn = await conn.begin()
        session = AsyncSession(bind=conn, expire_on_commit=False)
        try:
            yield session
        finally:
            await session.close()
            await txn.rollback()


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
    gid = _make_gid()
    user = User(github_id=gid, github_username="testuser", email=f"test-{gid}@example.com")
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)
    return {
        "access_token": create_access_token(str(user.id)),
        "refresh_token": create_refresh_token(str(user.id)),
        "user_id": str(user.id),
    }


@pytest.fixture
async def admin_user_tokens(db_session):
    gid = _make_gid()
    user = User(
        github_id=gid,
        github_username="adminuser",
        email=f"admin-{gid}@example.com",
        role="admin",
    )
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)
    return {
        "access_token": create_access_token(str(user.id)),
        "refresh_token": create_refresh_token(str(user.id)),
        "user_id": str(user.id),
    }


@pytest.fixture
async def reviewer_user_tokens(db_session):
    gid = _make_gid()
    user = User(
        github_id=gid,
        github_username="revieweruser",
        email=f"reviewer-{gid}@example.com",
        role="reviewer",
    )
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)
    return {
        "access_token": create_access_token(str(user.id)),
        "refresh_token": create_refresh_token(str(user.id)),
        "user_id": str(user.id),
    }


@pytest.fixture
async def second_user_tokens(db_session):
    """A second developer user for cross-ownership tests."""
    gid = _make_gid()
    user = User(github_id=gid, github_username="otheruser", email=f"other-{gid}@example.com")
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)
    return {
        "access_token": create_access_token(str(user.id)),
        "refresh_token": create_refresh_token(str(user.id)),
        "user_id": str(user.id),
    }


@pytest.fixture
async def sample_project(db_session, auth_tokens):
    project = Project(
        name="Test Project",
        description="A test project",
        status=ProjectStatus.DRAFT,
        owner_id=_uuid.UUID(auth_tokens["user_id"]),
    )
    db_session.add(project)
    await db_session.flush()
    await db_session.refresh(project)
    return project


@pytest.fixture
async def sample_dataset(db_session, auth_tokens):
    dataset = Dataset(
        name="Test Dataset",
        description="A test dataset",
        owner_id=_uuid.UUID(auth_tokens["user_id"]),
    )
    db_session.add(dataset)
    await db_session.flush()
    await db_session.refresh(dataset)
    return dataset


@pytest.fixture
async def sample_mcp_server(db_session, auth_tokens):
    server = McpServer(
        name="Test MCP Server",
        description="A test MCP server",
        manifest={"tools": []},
        owner_id=_uuid.UUID(auth_tokens["user_id"]),
    )
    db_session.add(server)
    await db_session.flush()
    await db_session.refresh(server)
    return server


@pytest.fixture
async def sample_skill(db_session, auth_tokens):
    skill = Skill(
        name="Test Skill",
        description="A test skill",
        skill_type="prompt",
        content="You are a helpful assistant.",
        owner_id=_uuid.UUID(auth_tokens["user_id"]),
    )
    db_session.add(skill)
    await db_session.flush()
    await db_session.refresh(skill)
    return skill


@pytest.fixture
async def sample_evaluation(db_session, auth_tokens, sample_project):
    evaluation = Evaluation(
        project_id=sample_project.id,
        model_name="gemini-2.0-flash",
        status=EvaluationStatus.PENDING,
    )
    db_session.add(evaluation)
    await db_session.flush()
    await db_session.refresh(evaluation)
    return evaluation


@pytest.fixture
async def completed_evaluation(db_session, auth_tokens, sample_project):
    evaluation = Evaluation(
        project_id=sample_project.id,
        model_name="gemini-2.0-flash",
        status=EvaluationStatus.COMPLETED,
        risk_score=0.35,
        summary="Low risk evaluation",
    )
    db_session.add(evaluation)
    await db_session.flush()
    await db_session.refresh(evaluation)
    return evaluation


@pytest.fixture
async def sample_report(db_session, completed_evaluation):
    report = Report(
        evaluation_id=completed_evaluation.id,
        content="Evaluation report content",
        status=ReportStatus.IN_REVIEW,
    )
    db_session.add(report)
    await db_session.flush()
    await db_session.refresh(report)
    return report
