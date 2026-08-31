import pytest

from app.models.audit_log import AuditLog


def _auth_header(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}


# --- List audit logs (admin only) ---


@pytest.mark.asyncio
async def test_list_audit_logs_as_admin(client, admin_user_tokens):
    response = await client.get(
        "/api/v1/audit-logs",
        headers=_auth_header(admin_user_tokens),
    )
    assert response.status_code == 200
    assert isinstance(response.json()["data"], list)


@pytest.mark.asyncio
async def test_list_audit_logs_as_developer_forbidden(client, auth_tokens):
    response = await client.get(
        "/api/v1/audit-logs",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_list_audit_logs_unauthenticated(client):
    response = await client.get("/api/v1/audit-logs")
    assert response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_list_audit_logs_with_seeded_entry(client, admin_user_tokens, db_session):
    log = AuditLog(
        action="test_action",
        resource_type="test",
        resource_id="abc-123",
        details="test detail",
    )
    db_session.add(log)
    await db_session.flush()

    response = await client.get(
        "/api/v1/audit-logs",
        headers=_auth_header(admin_user_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert any(entry["action"] == "test_action" for entry in data)


@pytest.mark.asyncio
async def test_list_audit_logs_filter_by_resource_type(client, admin_user_tokens, db_session):
    log = AuditLog(action="filtered_action", resource_type="widget", resource_id="w-1")
    db_session.add(log)
    await db_session.flush()

    response = await client.get(
        "/api/v1/audit-logs?resource_type=widget",
        headers=_auth_header(admin_user_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert all(entry["resource_type"] == "widget" for entry in data)
    assert any(entry["action"] == "filtered_action" for entry in data)


@pytest.mark.asyncio
async def test_list_audit_logs_filter_by_user_id(client, admin_user_tokens, db_session):
    import uuid
    uid = uuid.UUID(admin_user_tokens["user_id"])
    log = AuditLog(action="admin_action", resource_type="user", user_id=uid)
    db_session.add(log)
    await db_session.flush()

    response = await client.get(
        f"/api/v1/audit-logs?user_id={uid}",
        headers=_auth_header(admin_user_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert all(entry["user_id"] == str(uid) for entry in data)


@pytest.mark.asyncio
async def test_list_audit_logs_as_reviewer_forbidden(client, reviewer_user_tokens):
    response = await client.get(
        "/api/v1/audit-logs",
        headers=_auth_header(reviewer_user_tokens),
    )
    assert response.status_code == 403
