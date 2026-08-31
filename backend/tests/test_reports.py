import uuid

import pytest

from app.models.report import ReportStatus


def _auth_header(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}


# --- List ---


@pytest.mark.asyncio
async def test_list_reports(client, auth_tokens, sample_report):
    response = await client.get(
        "/api/v1/reports",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert any(r["id"] == str(sample_report.id) for r in data)


@pytest.mark.asyncio
async def test_list_reports_unauthenticated(client):
    response = await client.get("/api/v1/reports")
    assert response.status_code in (401, 403)


# --- Get ---


@pytest.mark.asyncio
async def test_get_report(client, auth_tokens, sample_report):
    response = await client.get(
        f"/api/v1/reports/{sample_report.id}",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["id"] == str(sample_report.id)
    assert data["content"] == "Evaluation report content"
    assert data["status"] == "in_review"


@pytest.mark.asyncio
async def test_get_report_not_found(client, auth_tokens):
    response = await client.get(
        f"/api/v1/reports/{uuid.uuid4()}",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 404


# --- Approve ---


@pytest.mark.asyncio
async def test_approve_report_as_reviewer(client, reviewer_user_tokens, sample_report):
    response = await client.post(
        f"/api/v1/reports/{sample_report.id}/approve",
        headers=_auth_header(reviewer_user_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "approved"
    assert data["reviewer_id"] == reviewer_user_tokens["user_id"]


@pytest.mark.asyncio
async def test_approve_report_as_admin(client, admin_user_tokens, sample_report):
    response = await client.post(
        f"/api/v1/reports/{sample_report.id}/approve",
        headers=_auth_header(admin_user_tokens),
    )
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "approved"


@pytest.mark.asyncio
async def test_approve_report_as_developer_forbidden(client, auth_tokens, sample_report):
    response = await client.post(
        f"/api/v1/reports/{sample_report.id}/approve",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_approve_already_approved_report_fails(client, reviewer_user_tokens, db_session, sample_report):
    sample_report.status = ReportStatus.APPROVED
    await db_session.flush()

    response = await client.post(
        f"/api/v1/reports/{sample_report.id}/approve",
        headers=_auth_header(reviewer_user_tokens),
    )
    assert response.status_code == 400


# --- Reject ---


@pytest.mark.asyncio
async def test_reject_report_as_reviewer(client, reviewer_user_tokens, sample_report):
    response = await client.post(
        f"/api/v1/reports/{sample_report.id}/reject",
        json={"comment": "Needs more detail"},
        headers=_auth_header(reviewer_user_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "rejected"
    assert data["rejection_comment"] == "Needs more detail"


@pytest.mark.asyncio
async def test_reject_report_as_developer_forbidden(client, auth_tokens, sample_report):
    response = await client.post(
        f"/api/v1/reports/{sample_report.id}/reject",
        json={"comment": "Nope"},
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_reject_report_requires_comment(client, reviewer_user_tokens, sample_report):
    response = await client.post(
        f"/api/v1/reports/{sample_report.id}/reject",
        json={},
        headers=_auth_header(reviewer_user_tokens),
    )
    assert response.status_code == 422


# --- Export ---


@pytest.mark.asyncio
async def test_export_report(client, auth_tokens, sample_report):
    response = await client.get(
        f"/api/v1/reports/{sample_report.id}/export",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    assert "application/json" in response.headers["content-type"]
    assert "content-disposition" in response.headers
    export_data = response.json()
    assert export_data["id"] == str(sample_report.id)


@pytest.mark.asyncio
async def test_export_report_not_found(client, auth_tokens):
    response = await client.get(
        f"/api/v1/reports/{uuid.uuid4()}/export",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 404
