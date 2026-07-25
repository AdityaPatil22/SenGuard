from __future__ import annotations

import enum
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.evaluation import Evaluation
    from app.models.project import Project
    from app.models.report import Report


class RoleEnum(enum.StrEnum):
    ADMIN = "admin"
    DEVELOPER = "developer"
    REVIEWER = "reviewer"


class Role(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "roles"

    name: Mapped[str] = mapped_column(Enum(RoleEnum), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))

    users: Mapped[list[User]] = relationship(back_populates="role")


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    role_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("roles.id"), nullable=False)
    role: Mapped[Role] = relationship(back_populates="users")

    owned_projects: Mapped[list[Project]] = relationship(back_populates="owner", lazy="raise")
    reviewed_reports: Mapped[list[Report]] = relationship(back_populates="reviewer", lazy="raise")
    reviewed_evaluations: Mapped[list[Evaluation]] = relationship(
        back_populates="reviewer", foreign_keys="[Evaluation.reviewer_id]", lazy="raise"
    )
