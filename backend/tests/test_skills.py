import uuid

import pytest


def _auth_header(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}


# --- Create ---


@pytest.mark.asyncio
async def test_create_skill_prompt(client, auth_tokens):
    response = await client.post(
        "/api/v1/skills",
        data={
            "name": "Summarizer",
            "skill_type": "prompt",
            "description": "Summarizes text",
            "content": "You are a summarization assistant.",
        },
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name"] == "Summarizer"
    assert data["skill_type"] == "prompt"
    assert data["content"] == "You are a summarization assistant."
    assert data["owner_id"] == auth_tokens["user_id"]


@pytest.mark.asyncio
async def test_create_skill_agent(client, auth_tokens):
    response = await client.post(
        "/api/v1/skills",
        data={
            "name": "Researcher",
            "skill_type": "agent",
            "content": "tools:\n  - web_search\n  - summarize",
        },
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    assert response.json()["data"]["skill_type"] == "agent"


@pytest.mark.asyncio
async def test_create_skill_plugin_with_file(client, auth_tokens):
    file_content = b"# plugin manifest\nversion: 1.0"
    response = await client.post(
        "/api/v1/skills",
        data={"name": "Plugin Skill", "skill_type": "plugin"},
        files={"file": ("manifest.yaml", file_content, "application/octet-stream")},
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name"] == "Plugin Skill"
    assert data["file_path"] is not None


@pytest.mark.asyncio
async def test_create_skill_invalid_type(client, auth_tokens):
    response = await client.post(
        "/api/v1/skills",
        data={"name": "Bad", "skill_type": "unknown"},
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_create_skill_requires_name(client, auth_tokens):
    response = await client.post(
        "/api/v1/skills",
        data={"skill_type": "prompt"},
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_skill_unauthenticated(client):
    response = await client.post(
        "/api/v1/skills",
        data={"name": "X", "skill_type": "prompt"},
    )
    assert response.status_code in (401, 403)


# --- List ---


@pytest.mark.asyncio
async def test_list_skills(client, auth_tokens, sample_skill):
    response = await client.get(
        "/api/v1/skills",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert any(s["id"] == str(sample_skill.id) for s in data)


@pytest.mark.asyncio
async def test_list_skills_empty(client, auth_tokens):
    response = await client.get(
        "/api/v1/skills",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    assert isinstance(response.json()["data"], list)


# --- Get ---


@pytest.mark.asyncio
async def test_get_skill(client, auth_tokens, sample_skill):
    response = await client.get(
        f"/api/v1/skills/{sample_skill.id}",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name"] == "Test Skill"
    assert data["skill_type"] == "prompt"


@pytest.mark.asyncio
async def test_get_skill_not_found(client, auth_tokens):
    response = await client.get(
        f"/api/v1/skills/{uuid.uuid4()}",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 404


# --- Update ---


@pytest.mark.asyncio
async def test_update_skill(client, auth_tokens, sample_skill):
    response = await client.put(
        f"/api/v1/skills/{sample_skill.id}",
        data={"name": "Updated Skill", "content": "New prompt text"},
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name"] == "Updated Skill"
    assert data["content"] == "New prompt text"


@pytest.mark.asyncio
async def test_update_skill_partial(client, auth_tokens, sample_skill):
    response = await client.put(
        f"/api/v1/skills/{sample_skill.id}",
        data={"description": "Only desc changed"},
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["description"] == "Only desc changed"
    assert data["name"] == "Test Skill"


@pytest.mark.asyncio
async def test_update_skill_forbidden_for_non_owner(client, second_user_tokens, sample_skill):
    response = await client.put(
        f"/api/v1/skills/{sample_skill.id}",
        data={"name": "Hacked"},
        headers=_auth_header(second_user_tokens),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_update_skill_admin_can_update(client, admin_user_tokens, sample_skill):
    response = await client.put(
        f"/api/v1/skills/{sample_skill.id}",
        data={"name": "Admin Updated"},
        headers=_auth_header(admin_user_tokens),
    )
    assert response.status_code == 200


# --- Delete ---


@pytest.mark.asyncio
async def test_delete_skill(client, auth_tokens, sample_skill):
    response = await client.delete(
        f"/api/v1/skills/{sample_skill.id}",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 200

    get_resp = await client.get(
        f"/api/v1/skills/{sample_skill.id}",
        headers=_auth_header(auth_tokens),
    )
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_skill_forbidden_for_non_owner(client, second_user_tokens, sample_skill):
    response = await client.delete(
        f"/api/v1/skills/{sample_skill.id}",
        headers=_auth_header(second_user_tokens),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_delete_skill_not_found(client, auth_tokens):
    response = await client.delete(
        f"/api/v1/skills/{uuid.uuid4()}",
        headers=_auth_header(auth_tokens),
    )
    assert response.status_code == 404
