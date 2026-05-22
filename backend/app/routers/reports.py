"""Daily energy reports and CSV export."""

from __future__ import annotations

import csv
import io
from datetime import UTC, datetime, timedelta
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


def _delta(a: float | None, b: float | None) -> float:
    sa, sb = safe_float(a), safe_float(b)
    if sa is None or sb is None:
        return 0.0
    return max(0.0, sb - sa)


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
        pv = round(_delta(first.pv_kwh_total, last.pv_kwh_total), 2)
        load = round(_delta(first.load_kwh_total, last.load_kwh_total), 2)
        net_delta = _delta(first.net_kwh_total, last.net_kwh_total)
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


@router.get("/daily")
async def daily_report(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(7, ge=1, le=365),
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

    try:
        co2_factor = float(settings.get("co2_kg_per_kwh") or "0.4")
    except ValueError:
        co2_factor = 0.4

    days_list = []
    local_now = now.astimezone(resolve_timezone(tz))
    for i in range(days):
        d = (local_now.date() - timedelta(days=days - 1 - i))
        key = d.isoformat()
        entry = by_day.get(
            key,
            {
                "date": key,
                "pv_kwh": 0,
                "load_kwh": 0,
                "import_kwh": 0,
                "export_kwh": 0,
                "self_consumption_pct": None,
                "sample_count": 0,
            },
        )
        entry["co2_kg"] = round((entry["pv_kwh"] or 0) * co2_factor, 2)
        days_list.append(entry)

    return sanitize_for_json(
        {
            "timezone": tz,
            "days": days_list,
            "totals": {
                "pv_kwh": round(sum(d["pv_kwh"] for d in days_list), 2),
                "load_kwh": round(sum(d["load_kwh"] for d in days_list), 2),
                "import_kwh": round(sum(d["import_kwh"] for d in days_list), 2),
                "export_kwh": round(sum(d["export_kwh"] for d in days_list), 2),
                "co2_kg": round(sum(d["co2_kg"] for d in days_list), 2),
            },
        }
    )


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
