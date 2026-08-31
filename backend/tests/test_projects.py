import uuid

import pytest


def _auth_header(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}


# --- Create ---


@pytest.mark.asyncio
async def test_create_project(client, auth_tokens):
    response = await client.post(
        "/api/v1/projects",
        json={"name": "My App", "description": "Desc"},
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name"] == "My App"
    assert data["description"] == "Desc"
    assert data["owner_id"] == auth_tokens["user_id"]
    assert data["status"] == "draft"


@pytest.mark.asyncio
async def test_create_project_with_repo_url(client, auth_tokens):
    response = await client.post(
        "/api/v1/projects",
        json={"name": "With Repo", "repo_url": "https://github.com/org/repo"},
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["repo_url"] == "https://github.com/org/repo"
    assert data["repo_full_name"] == "org/repo"


@pytest.mark.asyncio
async def test_create_project_requires_name(client, auth_tokens):
    response = await client.post(
        "/api/v1/projects",
        json={"description": "no name"},
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_project_unauthenticated(client):
    response = await client.post("/api/v1/projects", json={"name": "X"})
    assert response.status_code in (401, 403)


# --- List ---


@pytest.mark.asyncio
async def test_list_projects_empty(client, auth_tokens):
    response = await client.get(
        "/api/v1/projects",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    assert response.json()["data"] == []


@pytest.mark.asyncio
async def test_list_projects_returns_own(client, auth_tokens, sample_project):
    response = await client.get(
        "/api/v1/projects",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert len(data) == 1
    assert data[0]["id"] == str(sample_project.id)


@pytest.mark.asyncio
async def test_list_projects_excludes_others(client, second_user_tokens, sample_project):
    response = await client.get(
        "/api/v1/projects",
        headers=_auth_header(second_user_tokens),
    )
    assert response.status_code == 200
    assert response.json()["data"] == []


# --- Get ---


@pytest.mark.asyncio
async def test_get_project(client, auth_tokens, sample_project):
    response = await client.get(
        f"/api/v1/projects/{sample_project.id}",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    assert response.json()["data"]["name"] == "Test Project"


@pytest.mark.asyncio
async def test_get_project_not_found(client, auth_tokens):
    response = await client.get(
        f"/api/v1/projects/{uuid.uuid4()}",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_project_forbidden_for_non_owner(client, second_user_tokens, sample_project):
    response = await client.get(
        f"/api/v1/projects/{sample_project.id}",
        headers=_auth_header(second_user_tokens),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_get_project_admin_can_access_any(client, admin_user_tokens, sample_project):
    response = await client.get(
        f"/api/v1/projects/{sample_project.id}",
        headers=_auth_header(admin_user_tokens),
    )
    assert response.status_code == 200


# --- Update ---


@pytest.mark.asyncio
async def test_update_project(client, auth_tokens, sample_project):
    response = await client.put(
        f"/api/v1/projects/{sample_project.id}",
        json={"name": "Renamed"},
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    assert response.json()["data"]["name"] == "Renamed"


@pytest.mark.asyncio
async def test_update_project_forbidden_for_non_owner(client, second_user_tokens, sample_project):
    response = await client.put(
        f"/api/v1/projects/{sample_project.id}",
        json={"name": "Hacked"},
        headers=_auth_header(second_user_tokens),
    )
    assert response.status_code == 403


# --- Delete ---


@pytest.mark.asyncio
async def test_delete_project(client, auth_tokens, sample_project):
    response = await client.delete(
        f"/api/v1/projects/{sample_project.id}",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    assert response.json()["success"] is True

    get_resp = await client.get(
        f"/api/v1/projects/{sample_project.id}",
        headers=_auth_header(auth_tokens),
    )
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_project_forbidden_for_non_owner(client, second_user_tokens, sample_project):
    response = await client.delete(
        f"/api/v1/projects/{sample_project.id}",
        headers=_auth_header(second_user_tokens),
    )
    assert response.status_code == 403
