from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ROOT_DIR / ".env"), env_file_encoding="utf-8", extra="ignore")

    app_env: str = "production"
    app_debug: bool = False
    app_name: str = "sentinel-ai"

    backend_host: str = "0.0.0.0"
    backend_port: int = 8000

    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    database_url: str = "postgresql+asyncpg://sentinel:sentinel@localhost:5432/sentinel_ai"

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    github_client_id: str = ""
    github_client_secret: str = ""

    storage_backend: str = "local"
    storage_local_path: str = "./storage"

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def database_url_sync(self) -> str:
        return self.database_url.replace("+asyncpg", "+psycopg2")


@lru_cache
def get_settings() -> Settings:
    return Settings()
