"""Shared energy totals for a local-calendar date range."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.json_util import safe_float
from app.models import Reading
from app.settings_store import site_timezone_from_settings
from app.timezone_util import local_date_key, resolve_timezone


def delta_nonneg(a: float | None, b: float | None) -> float:
    sa, sb = safe_float(a), safe_float(b)
    if sa is None or sb is None:
        return 0.0
    return max(0.0, sb - sa)


def delta_signed(a: float | None, b: float | None) -> float:
    sa, sb = safe_float(a), safe_float(b)
    if sa is None or sb is None:
        return 0.0
    return sb - sa


def day_energy(rows: list[Reading], tz_name: str | None) -> dict[str, dict[str, Any]]:
    by_day: dict[str, list[Reading]] = {}
    for r in rows:
        key = local_date_key(r.ts, tz_name)
        by_day.setdefault(key, []).append(r)

    out: dict[str, dict[str, Any]] = {}
    for day, group in sorted(by_day.items()):
        group.sort(key=lambda x: x.ts)
        first, last = group[0], group[-1]
        pv = round(delta_nonneg(first.pv_kwh_total, last.pv_kwh_total), 2)
        load = round(delta_nonneg(first.load_kwh_total, last.load_kwh_total), 2)
        net_delta = delta_signed(first.net_kwh_total, last.net_kwh_total)
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


def day_keys_for_range(start: date, end: date) -> list[str]:
    n = (end - start).days + 1
    return [(start + timedelta(days=i)).isoformat() for i in range(n)]


def utc_range_for_local_dates(
    first_key: str, last_key: str, tz_name: str | None
) -> tuple[datetime, datetime]:
    tz = resolve_timezone(tz_name)
    d0 = date.fromisoformat(first_key)
    d1 = date.fromisoformat(last_key)
    start_local = datetime.combine(d0, time.min, tzinfo=tz)
    end_local = datetime.combine(d1, time.min, tzinfo=tz) + timedelta(days=1)
    return start_local.astimezone(UTC), end_local.astimezone(UTC)


def empty_day_entry(key: str) -> dict[str, Any]:
    return {
        "date": key,
        "pv_kwh": 0,
        "load_kwh": 0,
        "import_kwh": 0,
        "export_kwh": 0,
        "self_consumption_pct": None,
        "sample_count": 0,
    }


def days_list_from_keys(
    by_day: dict[str, dict[str, Any]],
    keys: list[str],
    co2_factor: float,
) -> list[dict[str, Any]]:
    days_list: list[dict[str, Any]] = []
    for key in keys:
        entry = dict(by_day.get(key, empty_day_entry(key)))
        entry["date"] = key
        entry["co2_kg"] = round((entry.get("pv_kwh") or 0) * co2_factor, 2)
        days_list.append(entry)
    return days_list


def totals_from_days(days_list: list[dict[str, Any]]) -> dict[str, float]:
    return {
        "pv_kwh": round(sum(d["pv_kwh"] for d in days_list), 2),
        "load_kwh": round(sum(d["load_kwh"] for d in days_list), 2),
        "import_kwh": round(sum(d["import_kwh"] for d in days_list), 2),
        "export_kwh": round(sum(d["export_kwh"] for d in days_list), 2),
        "co2_kg": round(sum(d["co2_kg"] for d in days_list), 2),
    }


def savings_from_totals(
    totals: dict[str, float],
    *,
    import_rate: float,
    export_rate: float,
) -> dict[str, float]:
    """Estimated bill impact from import/export rates ($/kWh)."""
    pv = totals.get("pv_kwh") or 0.0
    load = totals.get("load_kwh") or 0.0
    imp = totals.get("import_kwh") or 0.0
    exp = totals.get("export_kwh") or 0.0
    self_kwh = round(min(pv, load), 2) if load > 0.01 else 0.0
    import_cost = round(imp * import_rate, 2)
    export_credit = round(exp * export_rate, 2)
    self_value = round(self_kwh * import_rate, 2)
    net_savings = round(self_value + export_credit - import_cost, 2)
    return {
        "self_consumption_kwh": self_kwh,
        "import_cost": import_cost,
        "export_credit": export_credit,
        "self_consumption_value": self_value,
        "net_savings": net_savings,
        "import_rate": import_rate,
        "export_rate": export_rate,
    }


async def readings_for_local_period(
    db: AsyncSession,
    keys: list[str],
    tz_name: str | None,
) -> list[Reading]:
    if not keys:
        return []
    start_utc, end_utc = utc_range_for_local_dates(keys[0], keys[-1], tz_name)
    result = await db.execute(
        select(Reading)
        .where(Reading.ts >= start_utc, Reading.ts < end_utc)
        .order_by(Reading.ts.asc())
    )
    return list(result.scalars().all())


def co2_factor_from_settings(settings: dict[str, str]) -> float:
    try:
        return float(settings.get("co2_kg_per_kwh") or "0.4")
    except ValueError:
        return 0.4


def calendar_month_bounds(year: int, month: int) -> tuple[date, date]:
    start = date(year, month, 1)
    if month == 12:
        end = date(year, 12, 31)
    else:
        end = date(year, month + 1, 1) - timedelta(days=1)
    return start, end


def previous_calendar_month(today: date) -> tuple[int, int]:
    if today.month == 1:
        return today.year - 1, 12
    return today.year, today.month - 1


async def build_period_report(
    db: AsyncSession,
    settings: dict[str, str],
    start: date,
    end: date,
) -> dict[str, Any]:
    tz = site_timezone_from_settings(settings)
    co2_factor = co2_factor_from_settings(settings)
    keys = day_keys_for_range(start, end)
    rows = await readings_for_local_period(db, keys, tz)
    by_day = day_energy(rows, tz)
    days_list = days_list_from_keys(by_day, keys, co2_factor)
    days_with_data = sum(1 for d in days_list if d.get("sample_count", 0) > 0)
    return {
        "timezone": tz,
        "period": {"start": keys[0], "end": keys[-1]},
        "days": days_list,
        "totals": totals_from_days(days_list),
        "days_with_data": days_with_data,
        "days_in_period": len(keys),
    }
