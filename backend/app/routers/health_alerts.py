from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.health_rules import RULE_CATALOG, catalog_for_api, default_health_rule_keys
from app.health_runner import run_health_with_persistence
from app.settings_store import get_all_settings
from app.routers.users import require_admin
from app.json_util import sanitize_for_json
from app.models import HealthEvent, User

router = APIRouter(prefix="/api/health", tags=["health"])


def _allowed_health_setting_keys() -> set[str]:
    keys = set(default_health_rule_keys().keys())
    for rule in RULE_CATALOG:
        keys.add(rule["setting_key"])
        for tunable in rule.get("tunables", []):
            keys.add(tunable["key"])
    return keys


class HealthRulesSave(BaseModel):
    settings: dict[str, Any] = Field(default_factory=dict)


@router.get("/rules")
async def health_rules(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    require_admin(user)
    settings = await get_all_settings(db)
    return {"rules": catalog_for_api(settings)}


@router.put("/rules")
async def save_health_rules(
    body: HealthRulesSave,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    require_admin(user)
    allowed = _allowed_health_setting_keys()
    from app.settings_store import set_setting

    for key, raw in body.settings.items():
        if key not in allowed:
            continue
        if key.startswith("health_rule_"):
            enabled = raw is True or str(raw).lower() in ("true", "1", "yes")
            await set_setting(db, key, "true" if enabled else "false")
        else:
            await set_setting(db, key, str(raw))
    await db.commit()
    settings = await get_all_settings(db)
    return {"ok": True, "rules": catalog_for_api(settings)}


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
