import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from app.models.report import Report, ReportStatus
from app.models.user import User, UserRole
from app.repositories.report import ReportRepository
from app.services.audit import create_audit_log

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

    async def get_owned(self, report_id: uuid.UUID, user: User) -> Report:
        from app.models.dataset import Dataset
        from app.models.mcp_server import McpServer
        from app.models.project import Project
        from app.models.skill import Skill

        report = await self.get(report_id)
        if user.role == UserRole.ADMIN:
            return report
        evaluation = report.evaluation
        if evaluation:
            owner_id = None
            if evaluation.project_id:
                project = await self.db.get(Project, evaluation.project_id)
                owner_id = project.owner_id if project else None
            elif evaluation.dataset_id:
                dataset = await self.db.get(Dataset, evaluation.dataset_id)
                owner_id = dataset.owner_id if dataset else None
            elif evaluation.mcp_server_id:
                server = await self.db.get(McpServer, evaluation.mcp_server_id)
                owner_id = server.owner_id if server else None
            elif evaluation.skill_id:
                skill = await self.db.get(Skill, evaluation.skill_id)
                owner_id = skill.owner_id if skill else None
            if owner_id == user.id:
                return report
        raise ForbiddenError("Not authorized to access this report")

    async def list_all(
        self,
        user: User,
        project_id: uuid.UUID | None = None,
        status: str | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> list[Report]:
        owner_id = None if user.role == UserRole.ADMIN else user.id
        return await self.repo.list_filtered(
            owner_id=owner_id,
            project_id=project_id,
            status=status,
            skip=skip,
            limit=limit,
        )

    async def approve(self, report_id: uuid.UUID, reviewer_id: uuid.UUID) -> Report:
        report = await self.get(report_id)
        self._check_transition(report, ReportStatus.APPROVED)
        await self.repo.update(
            report,
            {
                "status": ReportStatus.APPROVED,
                "reviewer_id": reviewer_id,
            },
        )
        await self._audit(reviewer_id, report_id, "approve")
        return await self.get(report_id)

    async def reject(self, report_id: uuid.UUID, reviewer_id: uuid.UUID, comment: str) -> Report:
        report = await self.get(report_id)
        self._check_transition(report, ReportStatus.REJECTED)
        await self.repo.update(
            report,
            {
                "status": ReportStatus.REJECTED,
                "reviewer_id": reviewer_id,
                "rejection_comment": comment,
            },
        )
        await self._audit(reviewer_id, report_id, "reject", comment)
        return await self.get(report_id)

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
        await create_audit_log(
            self.db,
            action=action,
            resource_type="report",
            resource_id=str(report_id),
            user_id=user_id,
            details=details,
        )


def _serialize(report: Report) -> dict:
    evaluation = report.evaluation
    project = evaluation.project if evaluation and evaluation.project_id else None
    dataset = evaluation.dataset if evaluation and evaluation.dataset_id else None
    mcp_server = evaluation.mcp_server if evaluation and evaluation.mcp_server_id else None
    skill = evaluation.skill if evaluation and evaluation.skill_id else None

    if project:
        subject_name = project.name
        eval_type = "application"
    elif dataset:
        subject_name = dataset.name
        eval_type = "dataset"
    elif mcp_server:
        subject_name = mcp_server.name
        eval_type = "mcp_server"
    elif skill:
        subject_name = skill.name
        eval_type = "skill"
    else:
        subject_name = None
        eval_type = "standalone"

    return {
        "id": str(report.id),
        "content": report.content,
        "status": report.status,
        "rejection_comment": report.rejection_comment,
        "evaluation_id": str(report.evaluation_id),
        "reviewer_id": str(report.reviewer_id) if report.reviewer_id else None,
        "project_id": str(evaluation.project_id) if evaluation and evaluation.project_id else None,
        "subject_name": subject_name,
        "evaluation_type": eval_type,
        "risk_score": evaluation.risk_score if evaluation else None,
        "created_at": report.created_at.isoformat(),
        "updated_at": report.updated_at.isoformat(),
    }
