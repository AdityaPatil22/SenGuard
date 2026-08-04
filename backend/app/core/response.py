from typing import Any


def success(data: Any = None, message: str = "") -> dict[str, Any]:
    return {"success": True, "message": message, "data": data}
