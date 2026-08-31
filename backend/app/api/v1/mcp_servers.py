import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.core.response import success
from app.db.session import get_db
from app.models.user import User
from app.schemas.mcp_server import McpServerCreate, McpServerUpdate
from app.services.mcp_server import McpServerService

router = APIRouter(prefix="/mcp-servers", tags=["mcp-servers"])


def _serialize(server) -> dict:
    return {
        "id": str(server.id),
        "name": server.name,
        "description": server.description,
        "manifest": server.manifest,
        "repo_url": server.repo_url,
        "owner_id": str(server.owner_id),
        "created_at": server.created_at.isoformat(),
        "updated_at": server.updated_at.isoformat(),
    }


@router.post("")
async def create_mcp_server(
    data: McpServerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = McpServerService(db)
    server = await service.create(
        data.name, current_user.id,
        description=data.description,
        manifest=data.manifest,
        repo_url=data.repo_url,
    )
    return success(data=_serialize(server), message="MCP server created")


@router.get("")
async def list_mcp_servers(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = McpServerService(db)
    servers = await service.list_all(current_user, skip, limit)
    return success(data=[_serialize(s) for s in servers], message="MCP servers retrieved")


@router.get("/{server_id}")
async def get_mcp_server(
    server_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = McpServerService(db)
    server = await service.get_owned(server_id, current_user)
    return success(data=_serialize(server), message="MCP server retrieved")


@router.put("/{server_id}")
async def update_mcp_server(
    server_id: uuid.UUID,
    data: McpServerUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = McpServerService(db)
    server = await service.update(server_id, current_user, data.model_dump(exclude_unset=True))
    return success(data=_serialize(server), message="MCP server updated")


@router.delete("/{server_id}")
async def delete_mcp_server(
    server_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = McpServerService(db)
    await service.delete(server_id, current_user)
    return success(message="MCP server deleted")
