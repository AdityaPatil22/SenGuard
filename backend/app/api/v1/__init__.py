from fastapi import APIRouter

from app.api.v1 import audit_logs, auth, datasets, evaluations, health, mcp_servers, projects, reports, skills, users

router = APIRouter(prefix="/v1")

router.include_router(health.router)
router.include_router(auth.router)
router.include_router(projects.router)
router.include_router(evaluations.router)
router.include_router(reports.router)
router.include_router(datasets.router)
router.include_router(mcp_servers.router)
router.include_router(skills.router)
router.include_router(audit_logs.router)
router.include_router(users.router)
