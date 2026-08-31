import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.mcp_server import McpServer
from app.models.user import User, UserRole
from app.repositories.mcp_server import McpServerRepository


class McpServerService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = McpServerRepository(db)

    async def create(
        self,
        name: str,
        owner_id: uuid.UUID,
        description: str | None = None,
        manifest: dict | None = None,
        repo_url: str | None = None,
    ) -> McpServer:
        server = McpServer(
            name=name,
            description=description,
            manifest=manifest,
            repo_url=repo_url,
            owner_id=owner_id,
        )
        return await self.repo.create(server)

    async def get(self, server_id: uuid.UUID) -> McpServer:
        server = await self.repo.get_by_id(server_id)
        if not server:
            raise NotFoundError("MCP server not found")
        return server

    async def get_owned(self, server_id: uuid.UUID, user: User) -> McpServer:
        server = await self.get(server_id)
        if user.role != UserRole.ADMIN and server.owner_id != user.id:
            raise ForbiddenError("Not authorized to access this MCP server")
        return server

    async def list_all(self, user: User, skip: int = 0, limit: int = 100) -> list[McpServer]:
        if user.role == UserRole.ADMIN:
            return await self.repo.get_all(skip, limit)
        return await self.repo.get_by_owner(user.id, skip, limit)

    async def update(
        self, server_id: uuid.UUID, user: User, data: dict
    ) -> McpServer:
        server = await self.get(server_id)
        if user.role != UserRole.ADMIN and server.owner_id != user.id:
            raise ForbiddenError("Not authorized to update this MCP server")
        return await self.repo.update(server, data)

    async def delete(self, server_id: uuid.UUID, user: User) -> None:
        server = await self.get(server_id)
        if user.role != UserRole.ADMIN and server.owner_id != user.id:
            raise ForbiddenError("Not authorized to delete this MCP server")
        await self.repo.delete(server)
