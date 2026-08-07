from typing import Any


class AppError(Exception):
    def __init__(self, message: str = "An error occurred", status_code: int = 500, errors: list[Any] | None = None):
        self.message = message
        self.status_code = status_code
        self.errors = errors or []
        super().__init__(self.message)


class NotFoundError(AppError):
    def __init__(self, message: str = "Resource not found"):
        super().__init__(message=message, status_code=404)


class UnauthorizedError(AppError):
    def __init__(self, message: str = "Not authenticated"):
        super().__init__(message=message, status_code=401)


class ForbiddenError(AppError):
    def __init__(self, message: str = "Not authorized"):
        super().__init__(message=message, status_code=403)


class BadRequestError(AppError):
    def __init__(self, message: str = "Bad request", errors: list[Any] | None = None):
        super().__init__(message=message, status_code=400, errors=errors)
