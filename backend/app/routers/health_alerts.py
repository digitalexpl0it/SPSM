from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.health_runner import run_health_with_persistence
from app.json_util import sanitize_for_json
from app.models import HealthEvent, User

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("/site")
async def site_health(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Evaluate rule-based alerts; persist transitions and send notifications."""
    return await run_health_with_persistence(db)


@router.get("/history")
async def health_history(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(30, ge=1, le=90),
):
    since = datetime.now(UTC) - timedelta(days=days)
    result = await db.execute(
        select(HealthEvent)
        .where(HealthEvent.first_seen >= since)
        .order_by(HealthEvent.last_seen.desc())
        .limit(200)
    )
    rows = result.scalars().all()
    return sanitize_for_json(
        [
            {
                "id": r.id,
                "alert_id": r.alert_id,
                "severity": r.severity,
                "title": r.title,
                "message": r.message,
                "detail": r.detail,
                "first_seen": r.first_seen.isoformat(),
                "last_seen": r.last_seen.isoformat(),
                "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
                "active": r.active,
            }
            for r in rows
        ]
    )
