from __future__ import annotations

import enum
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.evaluation import Evaluation
    from app.models.user import User


class ReportStatus(enum.StrEnum):
    DRAFT = "draft"
    IN_REVIEW = "in_review"
    APPROVED = "approved"
    REJECTED = "rejected"


class Report(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "reports"

    content: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Enum(ReportStatus), default=ReportStatus.DRAFT, nullable=False)
    rejection_comment: Mapped[str | None] = mapped_column(Text)

    evaluation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("evaluations.id"), unique=True, nullable=False
    )
    evaluation: Mapped[Evaluation] = relationship(back_populates="report")

    reviewer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    reviewer: Mapped[User | None] = relationship(back_populates="reviewed_reports")
