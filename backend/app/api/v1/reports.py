from fastapi import APIRouter, Depends

from app.auth.dependencies import require_roles
from app.core.response import success
from app.models.user import User

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("")
async def list_reports(_current_user: User = Depends(require_roles("admin", "reviewer", "developer"))):
    return success(data=[], message="Reports retrieved")
