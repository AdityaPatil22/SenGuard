import uuid

import pytest


def _auth_header(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}


# --- Create ---


@pytest.mark.asyncio
async def test_create_mcp_server(client, auth_tokens):
    response = await client.post(
        "/api/v1/mcp-servers",
        json={
            "name": "My MCP Server",
            "description": "Tool server",
            "manifest": {"tools": [{"name": "search"}]},
            "repo_url": "https://github.com/org/mcp-server",
        },
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name"] == "My MCP Server"
    assert data["manifest"]["tools"][0]["name"] == "search"
    assert data["owner_id"] == auth_tokens["user_id"]


@pytest.mark.asyncio
async def test_create_mcp_server_minimal(client, auth_tokens):
    response = await client.post(
        "/api/v1/mcp-servers",
        json={"name": "Minimal Server"},
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name"] == "Minimal Server"
    assert data["description"] is None
    assert data["manifest"] is None


@pytest.mark.asyncio
async def test_create_mcp_server_requires_name(client, auth_tokens):
    response = await client.post(
        "/api/v1/mcp-servers",
        json={"description": "no name"},
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_mcp_server_unauthenticated(client):
    response = await client.post("/api/v1/mcp-servers", json={"name": "X"})
    assert response.status_code in (401, 403)


# --- List ---


@pytest.mark.asyncio
async def test_list_mcp_servers(client, auth_tokens, sample_mcp_server):
    response = await client.get(
        "/api/v1/mcp-servers",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert any(s["id"] == str(sample_mcp_server.id) for s in data)


@pytest.mark.asyncio
async def test_list_mcp_servers_empty(client, auth_tokens):
    response = await client.get(
        "/api/v1/mcp-servers",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    assert isinstance(response.json()["data"], list)


# --- Get ---


@pytest.mark.asyncio
async def test_get_mcp_server(client, auth_tokens, sample_mcp_server):
    response = await client.get(
        f"/api/v1/mcp-servers/{sample_mcp_server.id}",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    assert response.json()["data"]["name"] == "Test MCP Server"


@pytest.mark.asyncio
async def test_get_mcp_server_not_found(client, auth_tokens):
    response = await client.get(
        f"/api/v1/mcp-servers/{uuid.uuid4()}",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 404


# --- Update ---


@pytest.mark.asyncio
async def test_update_mcp_server(client, auth_tokens, sample_mcp_server):
    response = await client.put(
        f"/api/v1/mcp-servers/{sample_mcp_server.id}",
        json={"name": "Updated Server", "description": "New desc"},
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name"] == "Updated Server"
    assert data["description"] == "New desc"


@pytest.mark.asyncio
async def test_update_mcp_server_forbidden_for_non_owner(client, second_user_tokens, sample_mcp_server):
    response = await client.put(
        f"/api/v1/mcp-servers/{sample_mcp_server.id}",
        json={"name": "Hacked"},
        headers=_auth_header(second_user_tokens),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_update_mcp_server_admin_can_update(client, admin_user_tokens, sample_mcp_server):
    response = await client.put(
        f"/api/v1/mcp-servers/{sample_mcp_server.id}",
        json={"name": "Admin Updated"},
        headers=_auth_header(admin_user_tokens),
    )
    assert response.status_code == 200
    assert response.json()["data"]["name"] == "Admin Updated"


# --- Delete ---


@pytest.mark.asyncio
async def test_delete_mcp_server(client, auth_tokens, sample_mcp_server):
    response = await client.delete(
        f"/api/v1/mcp-servers/{sample_mcp_server.id}",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200

    get_resp = await client.get(
        f"/api/v1/mcp-servers/{sample_mcp_server.id}",
        headers=_auth_header(auth_tokens),
    )
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_mcp_server_forbidden_for_non_owner(client, second_user_tokens, sample_mcp_server):
    response = await client.delete(
        f"/api/v1/mcp-servers/{sample_mcp_server.id}",
        headers=_auth_header(second_user_tokens),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_delete_mcp_server_not_found(client, auth_tokens):
    response = await client.delete(
        f"/api/v1/mcp-servers/{uuid.uuid4()}",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 404
