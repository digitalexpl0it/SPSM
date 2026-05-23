"""Admin database stats and data retention purge."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin, require_write_access
from app.data_retention import (
    MAX_RETENTION_YEARS,
    MIN_RETENTION_YEARS,
    database_stats,
    retention_enabled_from_settings,
    retention_years_from_settings,
    run_retention_purge,
)
from app.database import get_db
from app.models import User
from app.settings_store import get_all_settings

router = APIRouter(prefix="/api/database", tags=["database"])


class RetentionSettingsUpdate(BaseModel):
    data_retention_enabled: bool
    data_retention_years: int = Field(ge=MIN_RETENTION_YEARS, le=MAX_RETENTION_YEARS)


@router.get("/stats")
async def get_database_stats(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await database_stats(db)


@router.put("/retention")
async def update_retention_settings(
    body: RetentionSettingsUpdate,
    _: Annotated[User, Depends(require_admin)],
    __: Annotated[User, Depends(require_write_access)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from app.settings_store import set_setting

    await set_setting(db, "data_retention_enabled", "true" if body.data_retention_enabled else "false")
    await set_setting(db, "data_retention_years", str(body.data_retention_years))
    await db.commit()
    stats = await database_stats(db)
    return {"ok": True, "retention": stats["retention"]}


@router.post("/purge")
async def purge_old_data(
    _: Annotated[User, Depends(require_admin)],
    __: Annotated[User, Depends(require_write_access)],
    db: Annotated[AsyncSession, Depends(get_db)],
    years: int | None = Query(
        None,
        ge=MIN_RETENTION_YEARS,
        le=MAX_RETENTION_YEARS,
        description="Override retention years for this purge only",
    ),
):
    settings = await get_all_settings(db)

    if years is not None:
        purge_years = years
    elif retention_enabled_from_settings(settings):
        purge_years = retention_years_from_settings(settings)
    else:
        raise HTTPException(
            status_code=400,
            detail=(
                "Enable data retention in settings or pass a years query parameter "
                f"({MIN_RETENTION_YEARS}–{MAX_RETENTION_YEARS}) for a one-time purge."
            ),
        )

    try:
        result = await run_retention_purge(db, purge_years)
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Purge failed: {e}") from e

    total = sum(result["deleted"].values())
    return {
        "ok": True,
        "message": f"Purged {total:,} rows older than {purge_years} years",
        **result,
    }
