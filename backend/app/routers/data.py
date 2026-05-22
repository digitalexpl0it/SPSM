from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import DeviceSnapshot, Reading, ReadingRollup, User
from app.json_util import sanitize_for_json, safe_float
from app.pvs_client import PvsClient, parse_livedata
from app.settings_store import battery_enabled_from_settings, get_all_settings, site_timezone_from_settings
from app.timezone_util import local_day_bounds

router = APIRouter(prefix="/api/data", tags=["data"])

Bucket = Literal["minute", "hour", "day", "month"]


@router.get("/live")
async def live_snapshot(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    settings = await get_all_settings(db)
    host = settings.get("pvs_host", "")
    serial = settings.get("pvs_serial", "")
    if not host or not serial:
        return {"connected": False, "error": "PVS not configured"}

    client = PvsClient(
        host=host,
        serial=serial,
        verify_ssl=settings.get("pvs_verify_ssl", "false").lower() == "true",
    )
    ok, message, _ = await client.test_connection()
    if not ok:
        return {"connected": False, "error": message}

    import httpx

    include_battery = battery_enabled_from_settings(settings)
    async with httpx.AsyncClient(verify=client.verify_ssl, timeout=30.0) as http:
        telemetry = await client.fetch_all_telemetry(http, include_battery=include_battery)

    livedata = parse_livedata(telemetry.get("livedata", {}))
    return sanitize_for_json(
        {
            "connected": True,
            "ts": datetime.now(UTC).isoformat(),
            "battery_enabled": include_battery,
            "livedata": {**livedata, "ts": datetime.now(UTC).isoformat()},
            "telemetry": telemetry,
        }
    )


@router.get("/latest")
async def latest_reading(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(Reading).order_by(Reading.ts.desc()).limit(1)
    )
    row = result.scalar_one_or_none()
    if not row:
        return None
    return _reading_dict(row)


@router.get("/series")
async def time_series(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    range: str = Query("day", pattern="^(hour|day|week|month|year)$"),
    bucket: Bucket = "hour",
):
    now = datetime.now(UTC)
    deltas = {
        "hour": timedelta(hours=1),
        "day": timedelta(days=1),
        "week": timedelta(days=7),
        "month": timedelta(days=30),
        "year": timedelta(days=365),
    }
    start = now - deltas.get(range, timedelta(days=1))

    use_rollups = range in ("week", "month", "year")
    rollup_bucket = "day" if range in ("month", "year") else "hour"
    if use_rollups:
        rresult = await db.execute(
            select(ReadingRollup)
            .where(
                ReadingRollup.bucket == rollup_bucket,
                ReadingRollup.bucket_start >= start,
            )
            .order_by(ReadingRollup.bucket_start.asc())
        )
        rollups = rresult.scalars().all()
        if rollups:
            return [
                {
                    "ts": r.bucket_start.isoformat(),
                    "pv_kw": round(safe_float(r.pv_kw_avg) or 0, 3),
                    "net_kw": round(safe_float(r.net_kw_avg) or 0, 3),
                    "load_kw": round(safe_float(r.load_kw_avg) or 0, 3),
                    "battery_kw": round(safe_float(r.battery_kw_avg) or 0, 3),
                    "battery_soc": round(safe_float(r.battery_soc_avg) or 0, 1),
                    "samples": r.sample_count,
                }
                for r in rollups
            ]

    result = await db.execute(
        select(Reading)
        .where(Reading.ts >= start)
        .order_by(Reading.ts.asc())
    )
    rows = result.scalars().all()

    if bucket == "minute" or (len(rows) < 50 and range in ("hour", "day")):
        return [_reading_dict(r) for r in rows]

    return _bucket_readings(rows, bucket)


@router.get("/devices/latest")
async def latest_devices(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    category: str | None = None,
):
    q = select(DeviceSnapshot).order_by(DeviceSnapshot.ts.desc())
    if category:
        q = q.where(DeviceSnapshot.category == category)
    result = await db.execute(q.limit(20))
    rows = result.scalars().all()
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for r in rows:
        if r.category in seen:
            continue
        seen.add(r.category)
        out.append({"ts": r.ts.isoformat(), "category": r.category, "payload": r.payload})
    return out


@router.get("/summary")
async def summary(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    settings = await get_all_settings(db)
    today_start, _ = local_day_bounds(site_timezone_from_settings(settings))
    result = await db.execute(
        select(Reading)
        .where(Reading.ts >= today_start)
        .order_by(Reading.ts.asc())
    )
    rows = result.scalars().all()
    if len(rows) < 2:
        return {
            "today_pv_kwh": 0,
            "today_net_kwh": 0,
            "today_export_kwh": 0,
            "today_import_kwh": 0,
            "today_load_kwh": 0,
            "sample_count": len(rows),
        }

    first, last = rows[0], rows[-1]

    def delta_nonneg(a: float | None, b: float | None) -> float:
        """Cumulative totals that only increase (PV, load)."""
        sa, sb = safe_float(a), safe_float(b)
        if sa is None or sb is None:
            return 0.0
        return max(0.0, sb - sa)

    def delta_signed(a: float | None, b: float | None) -> float:
        """Signed change (grid net: + = import, − = export)."""
        sa, sb = safe_float(a), safe_float(b)
        if sa is None or sb is None:
            return 0.0
        return sb - sa

    net_delta = delta_signed(first.net_kwh_total, last.net_kwh_total)
    return sanitize_for_json(
        {
            "today_pv_kwh": round(delta_nonneg(first.pv_kwh_total, last.pv_kwh_total), 2),
            "today_net_kwh": round(net_delta, 2),
            "today_import_kwh": round(max(0.0, net_delta), 2),
            "today_export_kwh": round(max(0.0, -net_delta), 2),
            "today_load_kwh": round(
                delta_nonneg(first.load_kwh_total, last.load_kwh_total), 2
            ),
            "timezone": site_timezone_from_settings(settings),
            "current": _reading_dict(last),
            "sample_count": len(rows),
        }
    )


def _reading_dict(r: Reading) -> dict[str, Any]:
    from app.json_util import safe_float

    return sanitize_for_json(
        {
            "ts": r.ts.isoformat(),
            "pv_kw": safe_float(r.pv_kw),
            "net_kw": safe_float(r.net_kw),
            "load_kw": safe_float(r.load_kw),
            "battery_kw": safe_float(r.battery_kw),
            "battery_soc": safe_float(r.battery_soc),
            "pv_kwh_total": safe_float(r.pv_kwh_total),
            "net_kwh_total": safe_float(r.net_kwh_total),
            "load_kwh_total": safe_float(r.load_kwh_total),
            "battery_kwh_total": safe_float(r.battery_kwh_total),
            "backup_minutes": r.backup_minutes,
            "mid_state": r.mid_state,
        }
    )


def _bucket_ts(r_ts: datetime, bucket: Bucket) -> datetime:
    """Normalize reading timestamp to bucket start (UTC)."""
    ts = r_ts if r_ts.tzinfo else r_ts.replace(tzinfo=UTC)
    if bucket == "hour":
        return ts.replace(minute=0, second=0, microsecond=0)
    if bucket == "day":
        return ts.replace(hour=0, minute=0, second=0, microsecond=0)
    if bucket == "month":
        return ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return ts.replace(minute=0, second=0, microsecond=0)


def _bucket_readings(rows: list[Reading], bucket: Bucket) -> list[dict[str, Any]]:
    """Simple time bucketing for charts."""
    if not rows:
        return []

    buckets: dict[datetime, list[Reading]] = {}
    for r in rows:
        key = _bucket_ts(r.ts, bucket)
        buckets.setdefault(key, []).append(r)

    from app.json_util import safe_float

    out = []
    for key, group in sorted(buckets.items()):
        def avg(attr: str) -> float:
            vals = [safe_float(getattr(g, attr)) for g in group]
            nums = [v for v in vals if v is not None]
            return sum(nums) / len(nums) if nums else 0.0

        out.append(
            {
                "ts": key.isoformat(),
                "pv_kw": round(avg("pv_kw"), 3),
                "net_kw": round(avg("net_kw"), 3),
                "load_kw": round(avg("load_kw"), 3),
                "battery_kw": round(avg("battery_kw"), 3),
                "battery_soc": round(avg("battery_soc"), 1),
                "samples": len(group),
            }
        )
    return out
