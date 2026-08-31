import uuid

import pytest


def _auth_header(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}


# --- Create ---


@pytest.mark.asyncio
async def test_create_dataset_without_file(client, auth_tokens):
    response = await client.post(
        "/api/v1/datasets",
        data={"name": "My Dataset"},
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name"] == "My Dataset"
    assert data["file_path"] is None
    assert data["record_count"] is None


@pytest.mark.asyncio
async def test_create_dataset_with_file(client, auth_tokens):
    csv_content = b"col1,col2\nval1,val2\nval3,val4\n"
    response = await client.post(
        "/api/v1/datasets",
        data={"name": "CSV Dataset", "description": "Has data"},
        files={"file": ("data.csv", csv_content, "text/csv")},
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name"] == "CSV Dataset"
    assert data["file_path"] is not None
    assert data["record_count"] == 3


@pytest.mark.asyncio
async def test_create_dataset_requires_name(client, auth_tokens):
    response = await client.post(
        "/api/v1/datasets",
        data={"description": "missing name"},
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_dataset_unauthenticated(client):
    response = await client.post("/api/v1/datasets", data={"name": "X"})
    assert response.status_code in (401, 403)


# --- List ---


@pytest.mark.asyncio
async def test_list_datasets_empty(client, auth_tokens):
    response = await client.get(
        "/api/v1/datasets",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    assert isinstance(response.json()["data"], list)


@pytest.mark.asyncio
async def test_list_datasets_returns_existing(client, auth_tokens, sample_dataset):
    response = await client.get(
        "/api/v1/datasets",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert len(data) >= 1
    assert any(d["id"] == str(sample_dataset.id) for d in data)


# --- Get ---


@pytest.mark.asyncio
async def test_get_dataset(client, auth_tokens, sample_dataset):
    response = await client.get(
        f"/api/v1/datasets/{sample_dataset.id}",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    assert response.json()["data"]["name"] == "Test Dataset"


@pytest.mark.asyncio
async def test_get_dataset_not_found(client, auth_tokens):
    response = await client.get(
        f"/api/v1/datasets/{uuid.uuid4()}",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 404


# --- Delete ---


@pytest.mark.asyncio
async def test_delete_dataset_by_owner(client, auth_tokens, sample_dataset):
    response = await client.delete(
        f"/api/v1/datasets/{sample_dataset.id}",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200

    get_resp = await client.get(
        f"/api/v1/datasets/{sample_dataset.id}",
        headers=_auth_header(auth_tokens),
    )
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_dataset_forbidden_for_non_owner(client, second_user_tokens, sample_dataset):
    response = await client.delete(
        f"/api/v1/datasets/{sample_dataset.id}",
        headers=_auth_header(second_user_tokens),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_delete_dataset_admin_can_delete(client, admin_user_tokens, sample_dataset):
    response = await client.delete(
        f"/api/v1/datasets/{sample_dataset.id}",
        headers=_auth_header(admin_user_tokens),
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_delete_dataset_not_found(client, auth_tokens):
    response = await client.delete(
        f"/api/v1/datasets/{uuid.uuid4()}",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 404
