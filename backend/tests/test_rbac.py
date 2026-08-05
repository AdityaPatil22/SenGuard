import pytest


@pytest.mark.asyncio
async def test_unauthenticated_request_rejected(client):
    response = await client.get("/api/v1/reports")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_authenticated_request_succeeds(client, auth_tokens):
    response = await client.get(
        "/api/v1/reports",
        headers={"Authorization": f"Bearer {auth_tokens['access_token']}"},
    )
    assert response.status_code == 200
    assert response.json()["success"] is True
