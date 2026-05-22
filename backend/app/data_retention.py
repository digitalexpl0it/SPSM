"""Historical data retention, purge, and database statistics."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.backup import table_counts
from app.models import DeviceSnapshot, HealthEvent, Reading, ReadingRollup
from app.settings_store import get_all_settings, set_setting

MIN_RETENTION_YEARS = 1
MAX_RETENTION_YEARS = 50
DEFAULT_RETENTION_YEARS = 5
AUTO_PURGE_INTERVAL = timedelta(hours=24)


def retention_enabled_from_settings(settings: dict[str, str]) -> bool:
    return settings.get("data_retention_enabled", "false").lower() == "true"


def retention_years_from_settings(settings: dict[str, str]) -> int:
    try:
        years = int((settings.get("data_retention_years") or "").strip() or DEFAULT_RETENTION_YEARS)
    except ValueError:
        years = DEFAULT_RETENTION_YEARS
    return max(MIN_RETENTION_YEARS, min(MAX_RETENTION_YEARS, years))


def cutoff_for_years(years: int, *, now: datetime | None = None) -> datetime:
    ref = now or datetime.now(UTC)
    return ref - timedelta(days=years * 365)


def _parse_last_purge(raw: str) -> datetime | None:
    raw = (raw or "").strip()
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            return dt.replace(tzinfo=UTC)
        return dt.astimezone(UTC)
    except ValueError:
        return None


async def purge_data_before(db: AsyncSession, cutoff: datetime) -> dict[str, int]:
    """Delete historical rows with timestamps strictly before cutoff (UTC)."""
    deleted: dict[str, int] = {}

    r = await db.execute(delete(Reading).where(Reading.ts < cutoff))
    deleted["readings"] = int(r.rowcount or 0)

    r = await db.execute(delete(DeviceSnapshot).where(DeviceSnapshot.ts < cutoff))
    deleted["device_snapshots"] = int(r.rowcount or 0)

    r = await db.execute(delete(ReadingRollup).where(ReadingRollup.bucket_start < cutoff))
    deleted["reading_rollups"] = int(r.rowcount or 0)

    r = await db.execute(delete(HealthEvent).where(HealthEvent.last_seen < cutoff))
    deleted["health_events"] = int(r.rowcount or 0)

    return deleted


async def run_retention_purge(db: AsyncSession, years: int) -> dict[str, Any]:
    cutoff = cutoff_for_years(years)
    deleted = await purge_data_before(db, cutoff)
    now = datetime.now(UTC)
    await set_setting(db, "data_retention_last_purge", now.isoformat())
    await db.commit()
    return {
        "cutoff": cutoff.isoformat(),
        "retention_years": years,
        "deleted": deleted,
        "purged_at": now.isoformat(),
    }


async def maybe_auto_purge(db: AsyncSession) -> dict[str, Any] | None:
    """Run at most once per day when retention is enabled."""
    settings = await get_all_settings(db)
    if not retention_enabled_from_settings(settings):
        return None

    now = datetime.now(UTC)
    last = _parse_last_purge(settings.get("data_retention_last_purge", ""))
    if last and (now - last) < AUTO_PURGE_INTERVAL:
        return None

    years = retention_years_from_settings(settings)
    result = await run_retention_purge(db, years)
    return result


async def database_stats(db: AsyncSession) -> dict[str, Any]:
    counts = await table_counts(db)

    oldest_reading = await db.scalar(select(func.min(Reading.ts)))
    newest_reading = await db.scalar(select(func.max(Reading.ts)))
    oldest_snapshot = await db.scalar(select(func.min(DeviceSnapshot.ts)))
    newest_snapshot = await db.scalar(select(func.max(DeviceSnapshot.ts)))

    db_size_bytes: int | None = None
    try:
        db_size_bytes = int(
            await db.scalar(text("SELECT pg_database_size(current_database())")) or 0
        )
    except Exception:
        pass

    settings = await get_all_settings(db)
    enabled = retention_enabled_from_settings(settings)
    years = retention_years_from_settings(settings)
    cutoff = cutoff_for_years(years) if enabled else None

    rows_older_than_cutoff: dict[str, int] | None = None
    if enabled and cutoff:
        rows_older_than_cutoff = {
            "readings": int(
                await db.scalar(
                    select(func.count()).select_from(Reading).where(Reading.ts < cutoff)
                )
                or 0
            ),
            "device_snapshots": int(
                await db.scalar(
                    select(func.count())
                    .select_from(DeviceSnapshot)
                    .where(DeviceSnapshot.ts < cutoff)
                )
                or 0
            ),
            "reading_rollups": int(
                await db.scalar(
                    select(func.count())
                    .select_from(ReadingRollup)
                    .where(ReadingRollup.bucket_start < cutoff)
                )
                or 0
            ),
            "health_events": int(
                await db.scalar(
                    select(func.count())
                    .select_from(HealthEvent)
                    .where(HealthEvent.last_seen < cutoff)
                )
                or 0
            ),
        }

    return {
        "counts": counts,
        "oldest_reading": oldest_reading.isoformat() if oldest_reading else None,
        "newest_reading": newest_reading.isoformat() if newest_reading else None,
        "oldest_device_snapshot": oldest_snapshot.isoformat() if oldest_snapshot else None,
        "newest_device_snapshot": newest_snapshot.isoformat() if newest_snapshot else None,
        "database_size_bytes": db_size_bytes,
        "retention": {
            "enabled": enabled,
            "years": years,
            "cutoff": cutoff.isoformat() if cutoff else None,
            "last_purge": settings.get("data_retention_last_purge") or None,
            "rows_older_than_cutoff": rows_older_than_cutoff,
        },
    }
