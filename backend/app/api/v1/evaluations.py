from fastapi import APIRouter, Depends

from app.auth.dependencies import require_roles
from app.core.response import success
from app.models.user import User

router = APIRouter(prefix="/evaluations", tags=["evaluations"])


@router.get("")
async def list_evaluations(_current_user: User = Depends(require_roles("admin", "reviewer", "developer"))):
    return success(data=[], message="Evaluations retrieved")
