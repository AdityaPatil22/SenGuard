import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, NotFoundError
from app.models.audit_log import AuditLog
from app.models.report import Report, ReportStatus
from app.repositories.report import ReportRepository

VALID_TRANSITIONS: dict[str, set[str]] = {
    ReportStatus.DRAFT: {ReportStatus.IN_REVIEW},
    ReportStatus.IN_REVIEW: {ReportStatus.APPROVED, ReportStatus.REJECTED},
}


class ReportService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = ReportRepository(db)

    async def get(self, report_id: uuid.UUID) -> Report:
        report = await self.repo.get_with_evaluation(report_id)
        if not report:
            raise NotFoundError("Report not found")
        return report

    async def list_all(
        self,
        project_id: uuid.UUID | None = None,
        status: str | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> list[Report]:
        if project_id:
            return await self.repo.get_by_project(project_id, skip, limit)
        if status:
            return await self.repo.get_by_status(status, skip, limit)
        return await self.repo.list_all_with_evaluation(skip, limit)

    async def approve(self, report_id: uuid.UUID, reviewer_id: uuid.UUID) -> Report:
        report = await self.get(report_id)
        self._check_transition(report, ReportStatus.APPROVED)
        await self.repo.update(report, {
            "status": ReportStatus.APPROVED,
            "reviewer_id": reviewer_id,
        })
        await self._audit(reviewer_id, report_id, "approve")
        return report

    async def reject(self, report_id: uuid.UUID, reviewer_id: uuid.UUID, comment: str) -> Report:
        report = await self.get(report_id)
        self._check_transition(report, ReportStatus.REJECTED)
        await self.repo.update(report, {
            "status": ReportStatus.REJECTED,
            "reviewer_id": reviewer_id,
            "rejection_comment": comment,
        })
        await self._audit(reviewer_id, report_id, "reject", comment)
        return report

    async def create_from_evaluation(self, evaluation_id: uuid.UUID, content: str | None) -> Report:
        report = Report(
            evaluation_id=evaluation_id,
            content=content,
            status=ReportStatus.IN_REVIEW,
        )
        return await self.repo.create(report)

    async def export_json(self, report_id: uuid.UUID) -> dict:
        report = await self.get(report_id)
        return _serialize(report)

    def _check_transition(self, report: Report, target: str) -> None:
        allowed = VALID_TRANSITIONS.get(report.status, set())
        if target not in allowed:
            raise BadRequestError(f"Cannot transition from {report.status} to {target}")

    async def _audit(self, user_id: uuid.UUID, report_id: uuid.UUID, action: str, details: str | None = None) -> None:
        log = AuditLog(
            user_id=user_id,
            action=action,
            resource_type="report",
            resource_id=str(report_id),
            details=details,
        )
        self.db.add(log)
        await self.db.flush()


def _serialize(report: Report) -> dict:
    evaluation = report.evaluation
    project = evaluation.project if evaluation else None
    return {
        "id": str(report.id),
        "content": report.content,
        "status": report.status,
        "rejection_comment": report.rejection_comment,
        "evaluation_id": str(report.evaluation_id),
        "reviewer_id": str(report.reviewer_id) if report.reviewer_id else None,
        "project_id": str(evaluation.project_id) if evaluation else None,
        "project_name": project.name if project else None,
        "risk_score": evaluation.risk_score if evaluation else None,
        "created_at": report.created_at.isoformat(),
        "updated_at": report.updated_at.isoformat(),
    }
