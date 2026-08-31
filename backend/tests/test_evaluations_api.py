import uuid

import pytest


def _auth_header(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}


# --- Create ---


@pytest.mark.asyncio
async def test_create_evaluation_for_project(client, auth_tokens, sample_project):
    response = await client.post(
        "/api/v1/evaluations",
        json={"project_id": str(sample_project.id), "model_name": "gemini-2.0-flash"},
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "pending"
    assert data["project_id"] == str(sample_project.id)
    assert data["evaluation_type"] == "application"


@pytest.mark.asyncio
async def test_create_evaluation_for_dataset(client, auth_tokens, sample_dataset):
    response = await client.post(
        "/api/v1/evaluations",
        json={"dataset_id": str(sample_dataset.id)},
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["dataset_id"] == str(sample_dataset.id)
    assert data["evaluation_type"] == "dataset"


@pytest.mark.asyncio
async def test_create_evaluation_for_mcp_server(client, auth_tokens, sample_mcp_server):
    response = await client.post(
        "/api/v1/evaluations",
        json={"mcp_server_id": str(sample_mcp_server.id)},
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["mcp_server_id"] == str(sample_mcp_server.id)
    assert data["evaluation_type"] == "mcp_server"


@pytest.mark.asyncio
async def test_create_evaluation_for_skill(client, auth_tokens, sample_skill):
    response = await client.post(
        "/api/v1/evaluations",
        json={"skill_id": str(sample_skill.id)},
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["skill_id"] == str(sample_skill.id)
    assert data["evaluation_type"] == "skill"


@pytest.mark.asyncio
async def test_create_evaluation_requires_exactly_one_subject(client, auth_tokens, sample_project, sample_dataset):
    response = await client.post(
        "/api/v1/evaluations",
        json={
            "project_id": str(sample_project.id),
            "dataset_id": str(sample_dataset.id),
        },
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_create_evaluation_no_subject_fails(client, auth_tokens):
    response = await client.post(
        "/api/v1/evaluations",
        json={},
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_create_evaluation_for_others_project_fails(client, second_user_tokens, sample_project):
    response = await client.post(
        "/api/v1/evaluations",
        json={"project_id": str(sample_project.id)},
        headers=_auth_header(second_user_tokens),
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_create_evaluation_nonexistent_project(client, auth_tokens):
    response = await client.post(
        "/api/v1/evaluations",
        json={"project_id": str(uuid.uuid4())},
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_create_evaluation_unauthenticated(client, sample_project):
    response = await client.post(
        "/api/v1/evaluations",
        json={"project_id": str(sample_project.id)},
    )
    assert response.status_code in (401, 403)


# --- List ---


@pytest.mark.asyncio
async def test_list_evaluations_empty(client, auth_tokens):
    response = await client.get(
        "/api/v1/evaluations",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    assert isinstance(response.json()["data"], list)


@pytest.mark.asyncio
async def test_list_evaluations_returns_existing(client, auth_tokens, sample_evaluation):
    response = await client.get(
        "/api/v1/evaluations",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert any(e["id"] == str(sample_evaluation.id) for e in data)


@pytest.mark.asyncio
async def test_list_evaluations_filter_by_project(client, auth_tokens, sample_evaluation, sample_project):
    response = await client.get(
        f"/api/v1/evaluations?project_id={sample_project.id}",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert all(e["project_id"] == str(sample_project.id) for e in data)


# --- Get ---


@pytest.mark.asyncio
async def test_get_evaluation(client, auth_tokens, sample_evaluation):
    response = await client.get(
        f"/api/v1/evaluations/{sample_evaluation.id}",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    assert response.json()["data"]["id"] == str(sample_evaluation.id)


@pytest.mark.asyncio
async def test_get_evaluation_not_found(client, auth_tokens):
    response = await client.get(
        f"/api/v1/evaluations/{uuid.uuid4()}",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_evaluation_forbidden_for_non_owner(client, second_user_tokens, sample_evaluation):
    response = await client.get(
        f"/api/v1/evaluations/{sample_evaluation.id}",
        headers=_auth_header(second_user_tokens),
    )
    assert response.status_code == 403


# --- Status ---


@pytest.mark.asyncio
async def test_get_evaluation_status(client, auth_tokens, sample_evaluation):
    response = await client.get(
        f"/api/v1/evaluations/{sample_evaluation.id}/status",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "pending"


# --- Run (completed evaluation cannot be re-run) ---


@pytest.mark.asyncio
async def test_run_completed_evaluation_fails(client, auth_tokens, completed_evaluation):
    response = await client.post(
        f"/api/v1/evaluations/{completed_evaluation.id}/run",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 400


# --- Stream ticket ---


@pytest.mark.asyncio
async def test_stream_ticket_requires_ownership(client, second_user_tokens, sample_evaluation):
    response = await client.post(
        f"/api/v1/evaluations/{sample_evaluation.id}/stream-ticket",
        headers=_auth_header(second_user_tokens),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_stream_ticket_success(client, auth_tokens, sample_evaluation):
    response = await client.post(
        f"/api/v1/evaluations/{sample_evaluation.id}/stream-ticket",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    assert "ticket" in response.json()["data"]


# --- Stream (invalid ticket) ---


@pytest.mark.asyncio
async def test_stream_invalid_ticket_rejected(client, sample_evaluation):
    response = await client.get(
        f"/api/v1/evaluations/{sample_evaluation.id}/stream?ticket=bogus",
    )
    assert response.status_code == 401
