from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.health_checks import evaluate_site_health
from app.models import User
from app.settings_store import get_all_settings

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("/site")
async def site_health(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Evaluate rule-based alerts from DB + a quick PVS login check."""
    settings = await get_all_settings(db)
    return await evaluate_site_health(db, settings)
