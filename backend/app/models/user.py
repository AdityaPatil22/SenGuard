from __future__ import annotations

import enum
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class UserRole(enum.StrEnum):
    ADMIN = "admin"
    DEVELOPER = "developer"
    REVIEWER = "reviewer"


if TYPE_CHECKING:
    from app.models.project import Project
    from app.models.report import Report


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    github_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True, nullable=False)
    github_username: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    github_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str | None] = mapped_column(Enum(UserRole), default=UserRole.DEVELOPER, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    owned_projects: Mapped[list[Project]] = relationship(back_populates="owner", lazy="raise")
    reviewed_reports: Mapped[list[Report]] = relationship(back_populates="reviewer", lazy="raise")
