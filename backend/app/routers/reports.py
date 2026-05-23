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
from app.report_period import (
    co2_factor_from_settings,
    day_energy,
    day_keys_for_range,
    days_list_from_keys,
    readings_for_local_period,
    savings_from_totals,
    totals_from_days,
)
from app.settings_store import (
    effective_electricity_rates,
    get_all_settings,
    site_timezone_from_settings,
)
from app.timezone_util import resolve_timezone

router = APIRouter(prefix="/api/reports", tags=["reports"])

YEAR_AGO_SHIFT_DAYS = 365


def _period_day_keys(end_local_date: date, num_days: int, *, year_shift: int = 0) -> list[str]:
    anchor = end_local_date - timedelta(days=year_shift)
    return day_keys_for_range(anchor - timedelta(days=num_days - 1), anchor)


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

    co2_factor = co2_factor_from_settings(settings)

    current_keys = _period_day_keys(local_now.date(), days)
    current_rows = await readings_for_local_period(db, current_keys, tz)
    current_by_day = day_energy(current_rows, tz)
    days_list = days_list_from_keys(current_by_day, current_keys, co2_factor)
    totals = totals_from_days(days_list)
    import_rate, export_rate, nem_plan = effective_electricity_rates(settings)
    savings = savings_from_totals(
        totals, import_rate=import_rate, export_rate=export_rate
    )
    savings["nem_plan"] = nem_plan

    yoy_keys = _period_day_keys(local_now.date(), days, year_shift=YEAR_AGO_SHIFT_DAYS)
    yoy_rows = await readings_for_local_period(db, yoy_keys, tz)
    yoy_by_day = day_energy(yoy_rows, tz)
    yoy_days_list = days_list_from_keys(yoy_by_day, yoy_keys, co2_factor)
    yoy_totals = totals_from_days(yoy_days_list)
    days_with_data = sum(1 for d in yoy_days_list if d.get("sample_count", 0) > 0)

    payload: dict[str, Any] = {
        "timezone": tz,
        "period": {"start": current_keys[0], "end": current_keys[-1]},
        "days": days_list,
        "totals": totals,
        "savings": savings,
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
    by_day = day_energy(rows, tz)

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


def _inv_power_kw(fields: dict[str, Any]) -> float:
    return safe_float(fields.get("pMppt1Kw") or fields.get("p3phsumKw")) or 0.0


def _inv_serial(path: str, fields: dict[str, Any]) -> str:
    return str(fields.get("sn") or path)


def _inv_lifetime_kwh(fields: dict[str, Any]) -> float | None:
    return safe_float(fields.get("ltea3phsumKwh"))


@router.get("/inverters/leaderboard")
async def inverter_leaderboard(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(30, ge=1, le=365),
):
    from app.models import DeviceSnapshot

    since = datetime.now(UTC) - timedelta(days=days)
    result = await db.execute(
        select(DeviceSnapshot)
        .where(
            DeviceSnapshot.category == "inverters",
            DeviceSnapshot.ts >= since,
        )
        .order_by(DeviceSnapshot.ts.asc())
    )
    snaps = list(result.scalars())
    stats: dict[str, dict[str, Any]] = {}

    for snap in snaps:
        if not isinstance(snap.payload, dict):
            continue
        for path, raw in snap.payload.items():
            if not isinstance(raw, dict):
                continue
            serial = _inv_serial(path, raw)
            lifetime = _inv_lifetime_kwh(raw)
            kw = _inv_power_kw(raw)
            entry = stats.setdefault(
                serial,
                {
                    "serial": serial,
                    "path": path,
                    "lifetime_min": None,
                    "lifetime_max": None,
                    "peak_kw": 0.0,
                    "samples": 0,
                },
            )
            entry["samples"] += 1
            entry["peak_kw"] = max(entry["peak_kw"], kw)
            if lifetime is not None:
                if entry["lifetime_min"] is None or lifetime < entry["lifetime_min"]:
                    entry["lifetime_min"] = lifetime
                if entry["lifetime_max"] is None or lifetime > entry["lifetime_max"]:
                    entry["lifetime_max"] = lifetime

    items: list[dict[str, Any]] = []
    for serial, entry in stats.items():
        energy = None
        if entry["lifetime_min"] is not None and entry["lifetime_max"] is not None:
            energy = round(max(0.0, entry["lifetime_max"] - entry["lifetime_min"]), 2)
        items.append(
            {
                "serial": serial,
                "path": entry["path"],
                "energy_kwh": energy,
                "peak_kw": round(entry["peak_kw"], 3),
                "samples": entry["samples"],
            }
        )

    items.sort(
        key=lambda x: (x["energy_kwh"] is not None, x["energy_kwh"] or 0.0),
        reverse=True,
    )
    return sanitize_for_json(
        {
            "days": days,
            "since": since.isoformat(),
            "items": items,
        }
    )
