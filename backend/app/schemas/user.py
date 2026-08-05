from pydantic import BaseModel

from app.models.user import UserRole


class UserRoleUpdate(BaseModel):
    role: UserRole
