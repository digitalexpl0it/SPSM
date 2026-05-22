"""Upsert reading rollups on each collector sample."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.json_util import safe_float
from app.models import Reading, ReadingRollup
from app.timezone_util import local_date_key, resolve_timezone


def _bucket_start_hour(ts: datetime) -> datetime:
    t = ts if ts.tzinfo else ts.replace(tzinfo=UTC)
    return t.astimezone(UTC).replace(minute=0, second=0, microsecond=0)


def _bucket_start_day(ts: datetime, tz_name: str | None) -> datetime:
    t = ts if ts.tzinfo else ts.replace(tzinfo=UTC)
    local = t.astimezone(resolve_timezone(tz_name))
    start = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return start.astimezone(UTC)


async def _upsert_bucket(
    session: AsyncSession,
    bucket: str,
    bucket_start: datetime,
    reading: Reading,
) -> None:
    result = await session.execute(
        select(ReadingRollup).where(
            ReadingRollup.bucket == bucket,
            ReadingRollup.bucket_start == bucket_start,
        )
    )
    row = result.scalar_one_or_none()
    n = 1

    def avg(prev: float | None, new: float | None, count: int) -> float | None:
        if new is None:
            return prev
        if prev is None:
            return new
        return prev + (new - prev) / count

    if row is None:
        session.add(
            ReadingRollup(
                bucket=bucket,
                bucket_start=bucket_start,
                pv_kw_avg=safe_float(reading.pv_kw),
                net_kw_avg=safe_float(reading.net_kw),
                load_kw_avg=safe_float(reading.load_kw),
                battery_kw_avg=safe_float(reading.battery_kw),
                battery_soc_avg=safe_float(reading.battery_soc),
                pv_kwh_total_end=safe_float(reading.pv_kwh_total),
                net_kwh_total_end=safe_float(reading.net_kwh_total),
                load_kwh_total_end=safe_float(reading.load_kwh_total),
                sample_count=1,
            )
        )
        return

    row.sample_count += 1
    n = row.sample_count
    row.pv_kw_avg = avg(row.pv_kw_avg, safe_float(reading.pv_kw), n)
    row.net_kw_avg = avg(row.net_kw_avg, safe_float(reading.net_kw), n)
    row.load_kw_avg = avg(row.load_kw_avg, safe_float(reading.load_kw), n)
    row.battery_kw_avg = avg(row.battery_kw_avg, safe_float(reading.battery_kw), n)
    row.battery_soc_avg = avg(row.battery_soc_avg, safe_float(reading.battery_soc), n)
    row.pv_kwh_total_end = safe_float(reading.pv_kwh_total)
    row.net_kwh_total_end = safe_float(reading.net_kwh_total)
    row.load_kwh_total_end = safe_float(reading.load_kwh_total)


async def upsert_rollups_for_reading(
    session: AsyncSession,
    reading: Reading,
    tz_name: str | None,
) -> None:
    ts = reading.ts if reading.ts.tzinfo else reading.ts.replace(tzinfo=UTC)
    await _upsert_bucket(session, "hour", _bucket_start_hour(ts), reading)
    await _upsert_bucket(session, "day", _bucket_start_day(ts, tz_name), reading)


async def backfill_rollups_from_readings(
    session: AsyncSession,
    tz_name: str | None,
) -> int:
    """Rebuild rollups from raw readings (idempotent)."""
    await session.execute(ReadingRollup.__table__.delete())
    result = await session.execute(select(Reading).order_by(Reading.ts.asc()))
    rows = result.scalars().all()
    for r in rows:
        await upsert_rollups_for_reading(session, r, tz_name)
    return len(rows)
