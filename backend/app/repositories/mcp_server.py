from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mcp_server import McpServer
from app.repositories.base import BaseRepository


class McpServerRepository(BaseRepository[McpServer]):
    def __init__(self, db: AsyncSession):
        super().__init__(McpServer, db)
