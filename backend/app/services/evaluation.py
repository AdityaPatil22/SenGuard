import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, NotFoundError
from app.langgraph.graph import evaluation_workflow
from app.models.evaluation import Evaluation, EvaluationStatus
from app.models.project import Project
from app.repositories.evaluation import EvaluationRepository
from app.services.report import ReportService


class EvaluationService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = EvaluationRepository(db)

    async def create(self, project_id: uuid.UUID, model_name: str | None, owner_id: uuid.UUID) -> Evaluation:
        project = await self.db.get(Project, project_id)
        if not project:
            raise NotFoundError("Project not found")
        if project.owner_id != owner_id:
            raise BadRequestError("Not your project")

        evaluation = Evaluation(
            project_id=project_id,
            model_name=model_name,
            status=EvaluationStatus.PENDING,
        )
        return await self.repo.create(evaluation)

    async def get(self, evaluation_id: uuid.UUID) -> Evaluation:
        evaluation = await self.repo.get_by_id(evaluation_id)
        if not evaluation:
            raise NotFoundError("Evaluation not found")
        return evaluation

    async def list_all(
        self,
        project_id: uuid.UUID | None = None,
        status: str | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> list[Evaluation]:
        if project_id:
            return await self.repo.get_by_project(project_id, skip, limit)
        if status:
            return await self.repo.get_by_status(status, skip, limit)
        return await self.repo.get_all(skip, limit)

    async def run(self, evaluation_id: uuid.UUID) -> Evaluation:
        evaluation = await self.get(evaluation_id)
        if evaluation.status == EvaluationStatus.RUNNING:
            raise BadRequestError("Evaluation already running")

        await self.repo.update(evaluation, {"status": EvaluationStatus.RUNNING})

        try:
            # ponytail: runs synchronously since LangGraph nodes are stubs; swap to background task when nodes do real work
            result = await evaluation_workflow.ainvoke({
                "project_id": str(evaluation.project_id),
                "model_name": evaluation.model_name,
            })

            summary = result.get("report") or None
            await self.repo.update(evaluation, {
                "status": EvaluationStatus.COMPLETED,
                "risk_score": result.get("risk_score"),
                "summary": summary,
                "node_results": {
                    "prompt_security": result.get("prompt_security_result"),
                    "dataset_validation": result.get("dataset_validation_result"),
                    "model_evaluation": result.get("model_evaluation_result"),
                },
            })

            report_svc = ReportService(self.db)
            await report_svc.create_from_evaluation(evaluation.id, summary)
        except Exception as e:
            await self.repo.update(evaluation, {
                "status": EvaluationStatus.FAILED,
                "error_message": str(e),
            })

        return evaluation
