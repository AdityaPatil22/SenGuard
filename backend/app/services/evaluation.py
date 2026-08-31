import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from app.langgraph.graph import get_evaluation_workflow
from app.models.dataset import Dataset
from app.models.evaluation import Evaluation, EvaluationStatus
from app.models.mcp_server import McpServer
from app.models.project import Project
from app.models.skill import Skill
from app.models.user import User, UserRole
from app.repositories.evaluation import EvaluationRepository
from app.services.auth import decrypt_token
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
        mcp_server_id: uuid.UUID | None = None,
        skill_id: uuid.UUID | None = None,
    ) -> Evaluation:
        subjects = [s for s in (project_id, dataset_id, mcp_server_id, skill_id) if s is not None]
        if len(subjects) != 1:
            raise BadRequestError("Exactly one evaluation subject is required (project, dataset, MCP server, or skill)")

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
            if dataset.owner_id and dataset.owner_id != owner_id:
                raise BadRequestError("Not your dataset")
        if mcp_server_id:
            server = await self.db.get(McpServer, mcp_server_id)
            if not server:
                raise NotFoundError("MCP server not found")
            if server.owner_id != owner_id:
                raise BadRequestError("Not your MCP server")
        if skill_id:
            skill = await self.db.get(Skill, skill_id)
            if not skill:
                raise NotFoundError("Skill not found")
            if skill.owner_id != owner_id:
                raise BadRequestError("Not your skill")

        evaluation = Evaluation(
            project_id=project_id,
            dataset_id=dataset_id,
            mcp_server_id=mcp_server_id,
            skill_id=skill_id,
            model_name=model_name,
            status=EvaluationStatus.PENDING,
        )
        return await self.repo.create(evaluation)

    async def get(self, evaluation_id: uuid.UUID) -> Evaluation:
        evaluation = await self.repo.get_by_id(evaluation_id)
        if not evaluation:
            raise NotFoundError("Evaluation not found")
        return evaluation

    async def get_owned(self, evaluation_id: uuid.UUID, user: User) -> Evaluation:
        evaluation = await self.get(evaluation_id)
        await self._check_owner(evaluation, user)
        return evaluation

    async def _check_owner(self, evaluation: Evaluation, user: User) -> None:
        if user.role == UserRole.ADMIN:
            return
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
        if owner_id != user.id:
            raise ForbiddenError("Not authorized to access this evaluation")

    async def list_all(
        self,
        user: User,
        project_id: uuid.UUID | None = None,
        status: str | None = None,
        evaluation_type: str | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> list[Evaluation]:
        return await self.repo.get_filtered(
            project_id=project_id,
            status=status,
            evaluation_type=evaluation_type,
            owner_id=None if user.role == UserRole.ADMIN else user.id,
            skip=skip,
            limit=limit,
        )

    async def run(self, evaluation_id: uuid.UUID) -> Evaluation:
        evaluation = await self.get(evaluation_id)
        if evaluation.status != EvaluationStatus.RUNNING:
            raise BadRequestError(f"Evaluation {evaluation_id} is {evaluation.status}, expected RUNNING")

        project = await self.db.get(Project, evaluation.project_id) if evaluation.project_id else None
        mcp_server = await self.db.get(McpServer, evaluation.mcp_server_id) if evaluation.mcp_server_id else None
        skill = await self.db.get(Skill, evaluation.skill_id) if evaluation.skill_id else None

        dataset_samples: list[str] = []
        if evaluation.dataset_id:
            ds = await self.db.get(Dataset, evaluation.dataset_id)
            if ds and ds.file_path:
                storage = get_storage_from_settings()
                if await storage.exists(ds.file_path):
                    raw = await storage.load(ds.file_path)
                    dataset_samples = raw.decode("utf-8", errors="replace").splitlines()[:50]

        # Load skill file content for plugin-type skills
        skill_file_content: str | None = None
        if skill and skill.file_path:
            storage = get_storage_from_settings()
            if await storage.exists(skill.file_path):
                raw = await storage.load(skill.file_path)
                skill_file_content = raw.decode("utf-8", errors="replace")

        repo_files: list[dict] = []
        repo_path: str | None = None
        repo_url = None
        if project and project.repo_url:
            repo_url = project.repo_url
        elif mcp_server and mcp_server.repo_url:
            repo_url = mcp_server.repo_url

        if repo_url:
            try:
                token = None
                owner_id = project.owner_id if project else (mcp_server.owner_id if mcp_server else None)
                owner = await self.db.get(User, owner_id) if owner_id else None
                if owner and owner.github_token:
                    token = decrypt_token(owner.github_token)
                repo_path = await clone_repo(repo_url, token=token)
                repo_files = extract_key_files(repo_path)
            except Exception as e:
                logger.warning("Failed to clone repo %s: %s", repo_url, e)

        # Determine evaluation type and subject info
        if evaluation.project_id:
            eval_type = "application"
            subject_name = project.name if project else "Unknown"
            subject_description = project.description or "" if project else ""
        elif evaluation.dataset_id:
            eval_type = "dataset"
            subject_name = "Dataset Evaluation"
            subject_description = ""
        elif evaluation.mcp_server_id:
            eval_type = "mcp_server"
            subject_name = mcp_server.name if mcp_server else "Unknown"
            subject_description = mcp_server.description or "" if mcp_server else ""
        elif evaluation.skill_id:
            eval_type = "skill"
            subject_name = skill.name if skill else "Unknown"
            subject_description = skill.description or "" if skill else ""
        else:
            eval_type = "standalone"
            subject_name = "Unknown"
            subject_description = ""

        try:
            result = await get_evaluation_workflow().ainvoke(
                {
                    "evaluation_id": str(evaluation.id),
                    "evaluation_type": eval_type,
                    "project_id": str(evaluation.project_id) if evaluation.project_id else "",
                    "project_name": subject_name,
                    "project_description": subject_description,
                    "model_name": evaluation.model_name,
                    "dataset_samples": dataset_samples,
                    "repo_files": repo_files,
                    "repo_path": repo_path,
                    "has_repo": bool(repo_files),
                    "mcp_manifest": mcp_server.manifest if mcp_server else None,
                    "skill_content": skill.content if skill else skill_file_content,
                    "skill_type": skill.skill_type if skill else None,
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

        return evaluation
