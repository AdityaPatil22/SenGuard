import logging
from abc import ABC, abstractmethod
from pathlib import Path

import httpx

from app.core.exceptions import BadRequestError

logger = logging.getLogger(__name__)


class StorageBackend(ABC):
    @abstractmethod
    async def save(self, path: str, data: bytes) -> str: ...

    @abstractmethod
    async def load(self, path: str) -> bytes: ...

    @abstractmethod
    async def delete(self, path: str) -> None: ...

    @abstractmethod
    async def exists(self, path: str) -> bool: ...


class LocalStorage(StorageBackend):
    def __init__(self, base_path: str = "./storage"):
        self.base_path = Path(base_path).resolve()
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _safe_path(self, path: str) -> Path:
        full_path = (self.base_path / path).resolve()
        if not full_path.is_relative_to(self.base_path):
            raise BadRequestError("Invalid storage path")
        return full_path

    async def save(self, path: str, data: bytes) -> str:
        full_path = self._safe_path(path)
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_bytes(data)
        return str(full_path)

    async def load(self, path: str) -> bytes:
        return self._safe_path(path).read_bytes()

    async def delete(self, path: str) -> None:
        target = self._safe_path(path)
        if target.exists():
            target.unlink()

    async def exists(self, path: str) -> bool:
        return self._safe_path(path).exists()


class SupabaseStorage(StorageBackend):
    def __init__(self, url: str, service_key: str, bucket: str = "datasets"):
        self.base_url = f"{url.rstrip('/')}/storage/v1/object"
        self.bucket = bucket
        self.headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        }

    async def save(self, path: str, data: bytes) -> str:
        filename = path.rsplit("/", 1)[-1]
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{self.base_url}/{self.bucket}/{path}",
                files={"file": (filename, data, "application/octet-stream")},
                headers={**self.headers, "x-upsert": "true"},
            )
            if r.status_code >= 400:
                logger.error("Supabase upload failed (%s): %s", r.status_code, r.text)
            r.raise_for_status()
        return path

    async def load(self, path: str) -> bytes:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{self.base_url}/{self.bucket}/{path}", headers=self.headers)
            r.raise_for_status()
        return r.content

    async def delete(self, path: str) -> None:
        async with httpx.AsyncClient() as client:
            r = await client.request(
                "DELETE",
                f"{self.base_url.replace('/object', '')}/object/{self.bucket}",
                headers=self.headers,
                json={"prefixes": [path]},
            )
            r.raise_for_status()

    async def exists(self, path: str) -> bool:
        async with httpx.AsyncClient() as client:
            r = await client.head(f"{self.base_url}/{self.bucket}/{path}", headers=self.headers)
        return r.status_code == 200


def get_storage_from_settings() -> StorageBackend:
    from app.config.settings import get_settings

    settings = get_settings()
    if settings.storage_backend == "supabase":
        return SupabaseStorage(
            url=settings.supabase_url,
            service_key=settings.supabase_service_key,
            bucket=settings.supabase_storage_bucket,
        )
    return LocalStorage(base_path=settings.storage_local_path)
