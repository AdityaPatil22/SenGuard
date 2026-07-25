import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import create_access_token, create_refresh_token, decode_token
from app.auth.password import hash_password, verify_password
from app.core.exceptions import BadRequestError, UnauthorizedError
from app.models.user import Role, RoleEnum, User
from app.repositories.user import UserRepository
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse


class AuthService:
    def __init__(self, db: AsyncSession):
        self.user_repo = UserRepository(db)

    async def login(self, data: LoginRequest) -> TokenResponse:
        user = await self.user_repo.get_by_email(data.email)
        if not user or not verify_password(data.password, user.hashed_password):
            raise UnauthorizedError("Invalid credentials")
        if not user.is_active:
            raise UnauthorizedError("Account is disabled")
        return self._create_tokens(user)

    async def register(self, data: RegisterRequest) -> TokenResponse:
        existing = await self.user_repo.get_by_email(data.email)
        if existing:
            raise BadRequestError("Email already registered")
        role = (
            await self.user_repo.db.execute(select(Role).where(Role.name == RoleEnum.DEVELOPER))
        ).scalar_one_or_none()
        if not role:
            raise BadRequestError("Default role not configured")
        user = User(
            email=data.email,
            hashed_password=hash_password(data.password),
            full_name=data.full_name,
            role_id=role.id,
        )
        user = await self.user_repo.create(user)
        user.role = role
        return self._create_tokens(user)

    async def refresh(self, refresh_token: str) -> TokenResponse:
        payload = decode_token(refresh_token, expected_type="refresh")
        user = await self.user_repo.get_by_id_with_role(uuid.UUID(payload["sub"]))
        if not user:
            raise UnauthorizedError("User not found")
        return self._create_tokens(user)

    @staticmethod
    def _create_tokens(user: User) -> TokenResponse:
        access_token = create_access_token(str(user.id), {"role": user.role.name})
        refresh_token = create_refresh_token(str(user.id))
        return TokenResponse(access_token=access_token, refresh_token=refresh_token)
