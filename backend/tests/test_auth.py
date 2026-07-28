import pytest


@pytest.mark.asyncio
async def test_refresh_token(client, auth_tokens):
    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": auth_tokens["refresh_token"]},
    )
    assert response.status_code == 200
    assert response.json()["data"]["access_token"]


@pytest.mark.asyncio
async def test_refresh_with_access_token_fails(client, auth_tokens):
    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": auth_tokens["access_token"]},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_me_returns_current_user(client, auth_tokens):
    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {auth_tokens['access_token']}"},
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["github_username"] == "testuser"


@pytest.mark.asyncio
async def test_me_rejects_invalid_token(client):
    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer invalid-token"},
    )
    assert response.status_code == 401
