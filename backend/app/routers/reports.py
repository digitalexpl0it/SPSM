"""Daily energy reports and CSV export."""

from __future__ import annotations

import csv
import io
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.json_util import safe_float, sanitize_for_json
from app.models import Reading, User
from app.settings_store import get_all_settings, site_timezone_from_settings
from app.timezone_util import local_date_key, resolve_timezone

router = APIRouter(prefix="/api/reports", tags=["reports"])

YEAR_AGO_SHIFT_DAYS = 365


def _delta_nonneg(a: float | None, b: float | None) -> float:
    """Cumulative totals that only increase (PV, load)."""
    sa, sb = safe_float(a), safe_float(b)
    if sa is None or sb is None:
        return 0.0
    return max(0.0, sb - sa)


def _delta_signed(a: float | None, b: float | None) -> float:
    """Signed change (grid net: + = import, − = export)."""
    sa, sb = safe_float(a), safe_float(b)
    if sa is None or sb is None:
        return 0.0
    return sb - sa


def _day_energy(rows: list[Reading], tz_name: str | None) -> dict[str, dict[str, Any]]:
    """Group readings by local calendar day; compute kWh deltas per day."""
    by_day: dict[str, list[Reading]] = {}
    for r in rows:
        key = local_date_key(r.ts, tz_name)
        by_day.setdefault(key, []).append(r)

    out: dict[str, dict[str, Any]] = {}
    for day, group in sorted(by_day.items()):
        group.sort(key=lambda x: x.ts)
        first, last = group[0], group[-1]
        pv = round(_delta_nonneg(first.pv_kwh_total, last.pv_kwh_total), 2)
        load = round(_delta_nonneg(first.load_kwh_total, last.load_kwh_total), 2)
        net_delta = _delta_signed(first.net_kwh_total, last.net_kwh_total)
        import_kwh = round(max(0.0, net_delta), 2)
        export_kwh = round(max(0.0, -net_delta), 2)
        self_pct = None
        if load > 0.01:
            self_pct = round(min(100.0, (min(pv, load) / load) * 100), 1)
        out[day] = {
            "date": day,
            "pv_kwh": pv,
            "load_kwh": load,
            "import_kwh": import_kwh,
            "export_kwh": export_kwh,
            "self_consumption_pct": self_pct,
            "sample_count": len(group),
        }
    return out


def _period_day_keys(end_local_date: date, num_days: int, *, year_shift: int = 0) -> list[str]:
    anchor = end_local_date - timedelta(days=year_shift)
    return [
        (anchor - timedelta(days=num_days - 1 - i)).isoformat() for i in range(num_days)
    ]


def _utc_range_for_local_dates(first_key: str, last_key: str, tz_name: str | None) -> tuple[datetime, datetime]:
    tz = resolve_timezone(tz_name)
    d0 = date.fromisoformat(first_key)
    d1 = date.fromisoformat(last_key)
    start_local = datetime.combine(d0, time.min, tzinfo=tz)
    end_local = datetime.combine(d1, time.min, tzinfo=tz) + timedelta(days=1)
    return start_local.astimezone(UTC), end_local.astimezone(UTC)


def _empty_day_entry(key: str) -> dict[str, Any]:
    return {
        "date": key,
        "pv_kwh": 0,
        "load_kwh": 0,
        "import_kwh": 0,
        "export_kwh": 0,
        "self_consumption_pct": None,
        "sample_count": 0,
    }


def _days_list_from_keys(
    by_day: dict[str, dict[str, Any]],
    keys: list[str],
    co2_factor: float,
) -> list[dict[str, Any]]:
    days_list: list[dict[str, Any]] = []
    for key in keys:
        entry = dict(by_day.get(key, _empty_day_entry(key)))
        entry["date"] = key
        entry["co2_kg"] = round((entry.get("pv_kwh") or 0) * co2_factor, 2)
        days_list.append(entry)
    return days_list


def _totals_from_days(days_list: list[dict[str, Any]]) -> dict[str, float]:
    return {
        "pv_kwh": round(sum(d["pv_kwh"] for d in days_list), 2),
        "load_kwh": round(sum(d["load_kwh"] for d in days_list), 2),
        "import_kwh": round(sum(d["import_kwh"] for d in days_list), 2),
        "export_kwh": round(sum(d["export_kwh"] for d in days_list), 2),
        "co2_kg": round(sum(d["co2_kg"] for d in days_list), 2),
    }


async def _readings_for_local_period(
    db: AsyncSession,
    keys: list[str],
    tz_name: str | None,
) -> list[Reading]:
    if not keys:
        return []
    start_utc, end_utc = _utc_range_for_local_dates(keys[0], keys[-1], tz_name)
    result = await db.execute(
        select(Reading)
        .where(Reading.ts >= start_utc, Reading.ts < end_utc)
        .order_by(Reading.ts.asc())
    )
    return list(result.scalars().all())


@router.get("/daily")
async def daily_report(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(7, ge=1, le=365),
):
    settings = await get_all_settings(db)
    tz = site_timezone_from_settings(settings)
    now = datetime.now(UTC)
    local_now = now.astimezone(resolve_timezone(tz))

    try:
        co2_factor = float(settings.get("co2_kg_per_kwh") or "0.4")
    except ValueError:
        co2_factor = 0.4

    current_keys = _period_day_keys(local_now.date(), days)
    current_rows = await _readings_for_local_period(db, current_keys, tz)
    current_by_day = _day_energy(current_rows, tz)
    days_list = _days_list_from_keys(current_by_day, current_keys, co2_factor)
    totals = _totals_from_days(days_list)

    yoy_keys = _period_day_keys(local_now.date(), days, year_shift=YEAR_AGO_SHIFT_DAYS)
    yoy_rows = await _readings_for_local_period(db, yoy_keys, tz)
    yoy_by_day = _day_energy(yoy_rows, tz)
    yoy_days_list = _days_list_from_keys(yoy_by_day, yoy_keys, co2_factor)
    yoy_totals = _totals_from_days(yoy_days_list)
    days_with_data = sum(1 for d in yoy_days_list if d.get("sample_count", 0) > 0)

    payload: dict[str, Any] = {
        "timezone": tz,
        "period": {"start": current_keys[0], "end": current_keys[-1]},
        "days": days_list,
        "totals": totals,
        "year_ago": {
            "available": days_with_data > 0,
            "period": {"start": yoy_keys[0], "end": yoy_keys[-1]},
            "days_with_data": days_with_data,
            "days_in_period": len(yoy_keys),
            "totals": yoy_totals,
        },
    }

    return sanitize_for_json(payload)


@router.get("/export")
async def export_csv(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(30, ge=1, le=365),
):
    settings = await get_all_settings(db)
    tz = site_timezone_from_settings(settings)
    now = datetime.now(UTC)
    start = now - timedelta(days=days)
    result = await db.execute(
        select(Reading).where(Reading.ts >= start).order_by(Reading.ts.asc())
    )
    rows = result.scalars().all()
    by_day = _day_energy(rows, tz)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        ["date", "pv_kwh", "load_kwh", "import_kwh", "export_kwh", "self_consumption_pct"]
    )
    for day in sorted(by_day.keys()):
        e = by_day[day]
        writer.writerow(
            [
                e["date"],
                e["pv_kwh"],
                e["load_kwh"],
                e["import_kwh"],
                e["export_kwh"],
                e["self_consumption_pct"] if e["self_consumption_pct"] is not None else "",
            ]
        )

    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="spsm-report-{days}d.csv"'},
    )


@router.get("/inverters/rank")
async def inverter_rank_today(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Weakest producers from latest inverter snapshot (power now)."""
    from app.models import DeviceSnapshot

    result = await db.execute(
        select(DeviceSnapshot)
        .where(DeviceSnapshot.category == "inverters")
        .order_by(DeviceSnapshot.ts.desc())
        .limit(1)
    )
    snap = result.scalar_one_or_none()
    if not snap or not snap.payload:
        return {"items": []}

    items: list[dict[str, Any]] = []
    for path, raw in snap.payload.items():
        if not isinstance(raw, dict):
            continue
        kw = safe_float(raw.get("pMppt1Kw") or raw.get("p3phsumKw")) or 0.0
        items.append(
            {
                "path": path,
                "serial": raw.get("sn") or path,
                "kw": round(kw, 3),
                "temp": safe_float(raw.get("tHtsnkDegc")),
            }
        )
    items.sort(key=lambda x: x["kw"])
    return {"ts": snap.ts.isoformat(), "items": items[:32]}
