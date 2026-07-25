import pytest

from app.core.exceptions import BadRequestError
from app.storage.base import LocalStorage


@pytest.fixture
def storage(tmp_path):
    return LocalStorage(base_path=str(tmp_path))


@pytest.mark.asyncio
async def test_save_and_load(storage):
    await storage.save("test.txt", b"hello")
    data = await storage.load("test.txt")
    assert data == b"hello"


@pytest.mark.asyncio
async def test_save_and_exists(storage):
    assert not await storage.exists("test.txt")
    await storage.save("test.txt", b"data")
    assert await storage.exists("test.txt")


@pytest.mark.asyncio
async def test_delete(storage):
    await storage.save("test.txt", b"data")
    await storage.delete("test.txt")
    assert not await storage.exists("test.txt")


@pytest.mark.asyncio
async def test_path_traversal_blocked(storage):
    with pytest.raises(BadRequestError):
        await storage.save("../../etc/passwd", b"malicious")


@pytest.mark.asyncio
async def test_nested_path_traversal_blocked(storage):
    with pytest.raises(BadRequestError):
        await storage.load("foo/../../outside")
