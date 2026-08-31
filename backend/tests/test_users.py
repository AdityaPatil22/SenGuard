import uuid

import pytest


def _auth_header(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}


# --- List users (admin only) ---


@pytest.mark.asyncio
async def test_list_users_as_admin(client, admin_user_tokens):
    response = await client.get(
        "/api/v1/users",
        headers=_auth_header(admin_user_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert isinstance(data, list)
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_list_users_as_developer_forbidden(client, auth_tokens):
    response = await client.get(
        "/api/v1/users",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_list_users_unauthenticated(client):
    response = await client.get("/api/v1/users")
    assert response.status_code in (401, 403)


# --- Get user (admin only) ---


@pytest.mark.asyncio
async def test_get_user_as_admin(client, admin_user_tokens, auth_tokens):
    response = await client.get(
        f"/api/v1/users/{auth_tokens['user_id']}",
        headers=_auth_header(admin_user_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["github_username"] == "testuser"


@pytest.mark.asyncio
async def test_get_user_as_developer_forbidden(client, auth_tokens):
    response = await client.get(
        f"/api/v1/users/{auth_tokens['user_id']}",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_get_user_not_found(client, admin_user_tokens):
    response = await client.get(
        f"/api/v1/users/{uuid.uuid4()}",
        headers=_auth_header(admin_user_tokens),
    )
    assert response.status_code == 404


# --- Change role (admin only) ---


@pytest.mark.asyncio
async def test_change_user_role(client, admin_user_tokens, auth_tokens):
    response = await client.patch(
        f"/api/v1/users/{auth_tokens['user_id']}/role",
        json={"role": "reviewer"},
        headers=_auth_header(admin_user_tokens),
    )
    assert response.status_code == 200
    assert response.json()["data"]["role"] == "reviewer"


@pytest.mark.asyncio
async def test_change_own_role_fails(client, admin_user_tokens):
    response = await client.patch(
        f"/api/v1/users/{admin_user_tokens['user_id']}/role",
        json={"role": "developer"},
        headers=_auth_header(admin_user_tokens),
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_change_role_invalid_value(client, admin_user_tokens, auth_tokens):
    response = await client.patch(
        f"/api/v1/users/{auth_tokens['user_id']}/role",
        json={"role": "superadmin"},
        headers=_auth_header(admin_user_tokens),
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_change_role_as_developer_forbidden(client, auth_tokens, second_user_tokens):
    response = await client.patch(
        f"/api/v1/users/{second_user_tokens['user_id']}/role",
        json={"role": "admin"},
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 403


# --- Deactivate user (admin only) ---


@pytest.mark.asyncio
async def test_deactivate_user(client, admin_user_tokens, auth_tokens):
    response = await client.patch(
        f"/api/v1/users/{auth_tokens['user_id']}/deactivate",
        headers=_auth_header(admin_user_tokens),
    )
    assert response.status_code == 200
    assert response.json()["data"]["is_active"] is False


@pytest.mark.asyncio
async def test_deactivate_self_fails(client, admin_user_tokens):
    response = await client.patch(
        f"/api/v1/users/{admin_user_tokens['user_id']}/deactivate",
        headers=_auth_header(admin_user_tokens),
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_deactivate_user_as_developer_forbidden(client, auth_tokens, second_user_tokens):
    response = await client.patch(
        f"/api/v1/users/{second_user_tokens['user_id']}/deactivate",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 403
