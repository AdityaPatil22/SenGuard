from abc import ABC, abstractmethod
from pathlib import Path


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
        resolved = (self.base_path / path).resolve()
        if not resolved.is_relative_to(self.base_path):
            raise ValueError("Path traversal detected")
        return resolved

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


def get_storage(backend: str = "local", **kwargs) -> StorageBackend:
    # ponytail: only local for now, add S3/MinIO branch when needed
    if backend == "local":
        return LocalStorage(**kwargs)
    raise ValueError(f"Unknown storage backend: {backend}")
