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


def _integrate_kwh(rows: list[Reading]) -> tuple[float, float, float]:
    """Trapezoidal integration of instantaneous kW samples into kWh."""
    if len(rows) < 2:
        return 0.0, 0.0, 0.0
    pv = load = net = 0.0
    for i in range(1, len(rows)):
        dt_h = (rows[i].ts - rows[i - 1].ts).total_seconds() / 3600.0
        if dt_h <= 0 or dt_h > 6:
            continue
        p0, p1 = safe_float(rows[i - 1].pv_kw), safe_float(rows[i].pv_kw)
        l0, l1 = safe_float(rows[i - 1].load_kw), safe_float(rows[i].load_kw)
        n0, n1 = safe_float(rows[i - 1].net_kw), safe_float(rows[i].net_kw)
        if p0 is not None and p1 is not None:
            pv += (p0 + p1) / 2 * dt_h
        if l0 is not None and l1 is not None:
            load += (l0 + l1) / 2 * dt_h
        if n0 is not None and n1 is not None:
            net += (n0 + n1) / 2 * dt_h
    return pv, load, net


def energy_totals_between(
    first: Reading,
    last: Reading,
    *,
    integrate_rows: list[Reading] | None = None,
) -> dict[str, float]:
    """Energy deltas between two samples; integrate kW if cumulative counters missing."""
    pv = delta_nonneg(first.pv_kwh_total, last.pv_kwh_total)
    load = delta_nonneg(first.load_kwh_total, last.load_kwh_total)
    net_delta = delta_signed(first.net_kwh_total, last.net_kwh_total)

    if integrate_rows and len(integrate_rows) >= 2:
        if pv < 0.001 and load < 0.001 and abs(net_delta) < 0.001:
            pv_i, load_i, net_i = _integrate_kwh(integrate_rows)
            if pv_i > 0.001 or load_i > 0.001 or abs(net_i) > 0.001:
                pv, load, net_delta = pv_i, load_i, net_i

    return {
        "today_pv_kwh": round(pv, 2),
        "today_load_kwh": round(load, 2),
        "today_net_kwh": round(net_delta, 2),
        "today_import_kwh": round(max(0.0, net_delta), 2),
        "today_export_kwh": round(max(0.0, -net_delta), 2),
    }


def today_energy_totals(
    rows_today: list[Reading],
    baseline: Reading | None,
    *,
    end: Reading | None = None,
) -> dict[str, float] | None:
    """
    Compute today's kWh from DB samples.

    Uses first/last reading today when possible; otherwise baseline (last sample before
    local midnight) through end (latest today or explicit end reading).
    """
    if len(rows_today) >= 2:
        return energy_totals_between(
            rows_today[0], rows_today[-1], integrate_rows=rows_today
        )
    if len(rows_today) == 1 and baseline is not None:
        last = end if end is not None else rows_today[0]
        chain = [baseline, rows_today[0]]
        if end is not None and end is not rows_today[0]:
            chain.append(end)
        return energy_totals_between(baseline, last, integrate_rows=chain)
    if len(rows_today) == 0 and baseline is not None and end is not None:
        return energy_totals_between(baseline, end, integrate_rows=[baseline, end])
    return None


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
        "method": "blended",
        "self_consumption_kwh": self_kwh,
        "import_cost": import_cost,
        "export_credit": export_credit,
        "self_consumption_value": self_value,
        "net_savings": net_savings,
        "import_rate": import_rate,
        "export_rate": export_rate,
    }


def savings_for_period(
    settings: dict[str, str],
    totals: dict[str, float],
    readings: list[Reading],
    tz_name: str | None,
) -> dict[str, Any]:
    """Blended single-rate savings, or TOU when enabled and configured."""
    from app.settings_store import effective_electricity_rates, electricity_rate_from_settings
    from app.tou_calc import (
        savings_from_tou,
        tou_config_from_settings,
        tou_energy_from_readings,
    )

    import_rate, export_rate, nem_plan = effective_electricity_rates(settings)
    config = tou_config_from_settings(settings)
    if config is not None:
        buckets = tou_energy_from_readings(readings, tz_name, config.schedule)
        flat_export = electricity_rate_from_settings(settings, "electricity_export_rate")
        return savings_from_tou(
            totals,
            buckets,
            config,
            flat_export_rate=flat_export,
        )

    savings = savings_from_totals(
        totals, import_rate=import_rate, export_rate=export_rate
    )
    savings["nem_plan"] = nem_plan
    return savings


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
