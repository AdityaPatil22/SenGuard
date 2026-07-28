import uuid
from urllib.parse import urlencode

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import create_access_token, create_refresh_token, decode_token
from app.config.settings import get_settings
from app.core.exceptions import BadRequestError, UnauthorizedError
from app.models.user import Role, RoleEnum, User
from app.repositories.user import UserRepository
from app.schemas.auth import TokenResponse

settings = get_settings()

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_API_URL = "https://api.github.com"


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_repo = UserRepository(db)

    @staticmethod
    def github_auth_url() -> str:
        params = {
            "client_id": settings.github_client_id,
            "scope": "read:user user:email",
        }
        return f"{GITHUB_AUTHORIZE_URL}?{urlencode(params)}"

    async def github_callback(self, code: str) -> dict:
        gh_token = await self._exchange_code(code)
        gh_user = await self._fetch_github_user(gh_token)

        user = await self.user_repo.get_by_github_id(gh_user["id"])
        if user:
            user.github_username = gh_user["login"]
            user.email = gh_user.get("email")
            user.avatar_url = gh_user.get("avatar_url")
            await self.db.flush()
        else:
            role = (
                await self.db.execute(select(Role).where(Role.name == RoleEnum.DEVELOPER))
            ).scalar_one_or_none()
            if not role:
                raise BadRequestError("Default role not configured")
            user = User(
                github_id=gh_user["id"],
                github_username=gh_user["login"],
                email=gh_user.get("email"),
                avatar_url=gh_user.get("avatar_url"),
                role_id=role.id,
            )
            user = await self.user_repo.create(user)
            user.role = role

        tokens = self._create_tokens(user)
        return {
            **tokens.model_dump(),
            "user": {
                "id": str(user.id),
                "github_username": user.github_username,
                "email": user.email,
                "avatar_url": user.avatar_url,
                "role": user.role.name,
            },
        }

    async def refresh(self, refresh_token: str) -> TokenResponse:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise UnauthorizedError("Invalid refresh token")
        user = await self.user_repo.get_by_id_with_role(uuid.UUID(payload["sub"]))
        if not user:
            raise UnauthorizedError("User not found")
        return self._create_tokens(user)

    @staticmethod
    def _create_tokens(user: User) -> TokenResponse:
        access_token = create_access_token(str(user.id), {"role": user.role.name})
        refresh_token = create_refresh_token(str(user.id))
        return TokenResponse(access_token=access_token, refresh_token=refresh_token)

    @staticmethod
    async def _exchange_code(code: str) -> str:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                GITHUB_TOKEN_URL,
                json={
                    "client_id": settings.github_client_id,
                    "client_secret": settings.github_client_secret,
                    "code": code,
                },
                headers={"Accept": "application/json"},
            )
            data = resp.json()
        if "access_token" not in data:
            raise BadRequestError(data.get("error_description", "GitHub authentication failed"))
        return data["access_token"]

    @staticmethod
    async def _fetch_github_user(token: str) -> dict:
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{GITHUB_API_URL}/user", headers=headers)
            resp.raise_for_status()
            user = resp.json()

            if not user.get("email"):
                emails_resp = await client.get(f"{GITHUB_API_URL}/user/emails", headers=headers)
                if emails_resp.status_code == 200:
                    for e in emails_resp.json():
                        if e.get("primary") and e.get("verified"):
                            user["email"] = e["email"]
                            break
        return user
