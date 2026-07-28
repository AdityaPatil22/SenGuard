from fastapi import APIRouter

from app.api.v1 import auth, datasets, evaluations, health, projects, reports

router = APIRouter(prefix="/v1")

router.include_router(health.router)
router.include_router(auth.router)
router.include_router(projects.router)
router.include_router(evaluations.router)
router.include_router(reports.router)
router.include_router(datasets.router)
