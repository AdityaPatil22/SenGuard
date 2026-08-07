import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, NotFoundError
from app.langgraph.graph import get_evaluation_workflow
from app.models.dataset import Dataset
from app.models.evaluation import Evaluation, EvaluationStatus
from app.models.project import Project
from app.repositories.evaluation import EvaluationRepository
from app.services.github import cleanup_repo, clone_repo, extract_key_files
from app.services.report import ReportService
from app.storage.base import get_storage_from_settings

logger = logging.getLogger(__name__)


class EvaluationService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = EvaluationRepository(db)

    async def create(
        self,
        model_name: str | None,
        owner_id: uuid.UUID,
        project_id: uuid.UUID | None = None,
        dataset_id: uuid.UUID | None = None,
    ) -> Evaluation:
        if project_id and dataset_id:
            raise BadRequestError("Choose either a project or a dataset, not both")
        if not project_id and not dataset_id:
            raise BadRequestError("Either project_id or dataset_id is required")

        if project_id:
            project = await self.db.get(Project, project_id)
            if not project:
                raise NotFoundError("Project not found")
            if project.owner_id != owner_id:
                raise BadRequestError("Not your project")
        if dataset_id:
            dataset = await self.db.get(Dataset, dataset_id)
            if not dataset:
                raise NotFoundError("Dataset not found")

        evaluation = Evaluation(
            project_id=project_id,
            dataset_id=dataset_id,
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
        evaluation_type: str | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> list[Evaluation]:
        if project_id:
            return await self.repo.get_by_project(project_id, skip, limit)
        if evaluation_type:
            return await self.repo.get_by_type(evaluation_type, skip, limit)
        if status:
            return await self.repo.get_by_status(status, skip, limit)
        return await self.repo.get_all(skip, limit)

    async def run(self, evaluation_id: uuid.UUID) -> Evaluation:
        evaluation = await self.get(evaluation_id)

        try:
            project = await self.db.get(Project, evaluation.project_id) if evaluation.project_id else None

            dataset_samples: list[str] = []
            if evaluation.dataset_id:
                ds = await self.db.get(Dataset, evaluation.dataset_id)
                if ds and ds.file_path:
                    storage = get_storage_from_settings()
                    if await storage.exists(ds.file_path):
                        raw = await storage.load(ds.file_path)
                        dataset_samples = raw.decode("utf-8", errors="replace").splitlines()[:50]

            repo_files: list[dict] = []
            repo_path: str | None = None
            if project and project.repo_url:
                try:
                    repo_path = await clone_repo(project.repo_url)
                    repo_files = extract_key_files(repo_path)
                except Exception as e:
                    logger.warning("Failed to clone repo %s: %s", project.repo_url, e)

            try:
                result = await get_evaluation_workflow().ainvoke(
                    {
                        "evaluation_id": str(evaluation.id),
                        "project_id": str(evaluation.project_id),
                        "project_name": project.name if project else "Unknown",
                        "project_description": project.description or "" if project else "",
                        "model_name": evaluation.model_name,
                        "dataset_samples": dataset_samples,
                        "repo_files": repo_files,
                        "repo_path": repo_path,
                        "has_repo": bool(repo_files),
                    }
                )
            finally:
                if repo_path:
                    cleanup_repo(repo_path)

            summary = result.get("report") or None
            pipeline_errors = result.get("errors") or []
            await self.repo.update(
                evaluation,
                {
                    "status": EvaluationStatus.COMPLETED,
                    "risk_score": result.get("risk_score"),
                    "summary": summary,
                    "error_message": "; ".join(pipeline_errors) if pipeline_errors else None,
                    "node_results": {
                        "scanners": result.get("scanner_results"),
                        "llm_analysis": result.get("llm_analysis_result"),
                        "risk_breakdown": result.get("risk_breakdown"),
                    },
                },
            )

            report_svc = ReportService(self.db)
            await report_svc.create_from_evaluation(evaluation.id, summary)
        except Exception as e:
            await self.repo.update(
                evaluation,
                {
                    "status": EvaluationStatus.FAILED,
                    "error_message": str(e),
                },
            )

        return evaluation
