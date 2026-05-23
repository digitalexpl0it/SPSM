"""Time-of-use period classification and savings from timestamped readings."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal

from app.json_util import safe_float
from app.models import Reading
from app.timezone_util import resolve_timezone

TouPeriod = Literal["peak", "off_peak", "super_off_peak"]
TOU_PERIODS: tuple[TouPeriod, ...] = ("peak", "off_peak", "super_off_peak")

VALID_TOU_SCHEDULES = frozenset({"sce_tou_d_4_9", "all_off_peak"})


@dataclass(frozen=True)
class TouConfig:
    schedule: str
    peak_rate: float
    off_peak_rate: float
    super_off_peak_rate: float
    nem_plan: str

    def rate_for(self, period: TouPeriod) -> float:
        if period == "peak":
            return self.peak_rate
        if period == "super_off_peak":
            return self.super_off_peak_rate
        return self.off_peak_rate

    def export_rate_for(self, period: TouPeriod) -> float:
        if self.nem_plan in ("nem1", "nem2"):
            return self.rate_for(period)
        return self.off_peak_rate  # unused when NEM3 uses flat export from settings


def tou_config_from_settings(settings: dict[str, str]) -> TouConfig | None:
    if (settings.get("tou_estimates_enabled") or "").lower() != "true":
        return None

    peak = _rate(settings.get("tou_peak_rate"))
    off = _rate(settings.get("tou_off_peak_rate"))
    super_off = _rate(settings.get("tou_super_off_peak_rate"))
    if peak <= 0 and off <= 0 and super_off <= 0:
        return None

    schedule = (settings.get("tou_schedule") or "sce_tou_d_4_9").strip().lower()
    if schedule not in VALID_TOU_SCHEDULES:
        schedule = "sce_tou_d_4_9"

    from app.settings_store import nem_plan_from_settings

    return TouConfig(
        schedule=schedule,
        peak_rate=peak,
        off_peak_rate=off,
        super_off_peak_rate=super_off,
        nem_plan=nem_plan_from_settings(settings),
    )


def _rate(raw: str | None) -> float:
    try:
        return max(0.0, float((raw or "").strip()))
    except ValueError:
        return 0.0


def classify_tou_period(local_dt: datetime, schedule: str) -> TouPeriod:
    """Map local timestamp to TOU period."""
    if schedule == "all_off_peak":
        return "off_peak"

    # SCE TOU-D 4–9PM style: weekday peak 16–21, super off 8–16, else off peak; weekends all off peak.
    if local_dt.weekday() >= 5:
        return "off_peak"

    hour = local_dt.hour
    if 16 <= hour < 21:
        return "peak"
    if 8 <= hour < 16:
        return "super_off_peak"
    return "off_peak"


def empty_tou_buckets() -> dict[TouPeriod, dict[str, float]]:
    return {p: {"import_kwh": 0.0, "export_kwh": 0.0} for p in TOU_PERIODS}


def tou_energy_from_readings(
    rows: list[Reading],
    tz_name: str | None,
    schedule: str,
) -> dict[TouPeriod, dict[str, float]]:
    """Attribute net meter deltas between consecutive samples to TOU periods."""
    buckets = empty_tou_buckets()
    if len(rows) < 2:
        return buckets

    tz = resolve_timezone(tz_name)
    sorted_rows = sorted(rows, key=lambda r: r.ts)

    for prev, curr in zip(sorted_rows, sorted_rows[1:]):
        delta = delta_signed(prev.net_kwh_total, curr.net_kwh_total)
        if abs(delta) < 1e-6:
            continue

        t0 = prev.ts if prev.ts.tzinfo else prev.ts.replace(tzinfo=UTC)
        t1 = curr.ts if curr.ts.tzinfo else curr.ts.replace(tzinfo=UTC)
        mid = t0 + (t1 - t0) / 2
        local_mid = mid.astimezone(tz)
        period = classify_tou_period(local_mid, schedule)

        if delta > 0:
            buckets[period]["import_kwh"] += delta
        else:
            buckets[period]["export_kwh"] += -delta

    for p in TOU_PERIODS:
        buckets[p]["import_kwh"] = round(buckets[p]["import_kwh"], 4)
        buckets[p]["export_kwh"] = round(buckets[p]["export_kwh"], 4)

    return buckets


def delta_signed(a: float | None, b: float | None) -> float:
    sa, sb = safe_float(a), safe_float(b)
    if sa is None or sb is None:
        return 0.0
    return sb - sa


def _weighted_avg_rate(buckets: dict[TouPeriod, dict[str, float]], config: TouConfig) -> float:
    weighted = 0.0
    volume = 0.0
    for period in TOU_PERIODS:
        kwh = buckets[period]["import_kwh"] + buckets[period]["export_kwh"]
        if kwh <= 0:
            continue
        weighted += kwh * config.rate_for(period)
        volume += kwh
    if volume > 0:
        return round(weighted / volume, 4)

    rates = [config.rate_for(p) for p in TOU_PERIODS if config.rate_for(p) > 0]
    if not rates:
        return 0.0
    return round(sum(rates) / len(rates), 4)


def savings_from_tou(
    totals: dict[str, float],
    buckets: dict[TouPeriod, dict[str, float]],
    config: TouConfig,
    *,
    flat_export_rate: float,
) -> dict[str, Any]:
    """TOU-aware savings; export credit per period under NEM 1/2, flat export under NEM 3/custom."""
    pv = totals.get("pv_kwh") or 0.0
    load = totals.get("load_kwh") or 0.0
    self_kwh = round(min(pv, load), 2) if load > 0.01 else 0.0

    import_cost = 0.0
    export_credit = 0.0
    period_details: list[dict[str, Any]] = []

    for period in TOU_PERIODS:
        imp = buckets[period]["import_kwh"]
        exp = buckets[period]["export_kwh"]
        import_rate = config.rate_for(period)
        if config.nem_plan in ("nem1", "nem2"):
            export_rate = import_rate
        else:
            export_rate = flat_export_rate if flat_export_rate > 0 else import_rate

        imp_cost = round(imp * import_rate, 2)
        exp_cred = round(exp * export_rate, 2)
        import_cost += imp_cost
        export_credit += exp_cred

        if imp > 0 or exp > 0:
            period_details.append(
                {
                    "period": period,
                    "label": _period_label(period),
                    "import_kwh": imp,
                    "export_kwh": exp,
                    "import_rate": import_rate,
                    "export_rate": export_rate,
                    "import_cost": imp_cost,
                    "export_credit": exp_cred,
                }
            )

    import_cost = round(import_cost, 2)
    export_credit = round(export_credit, 2)
    avg_rate = _weighted_avg_rate(buckets, config)
    self_value = round(self_kwh * avg_rate, 2)
    net_savings = round(self_value + export_credit - import_cost, 2)

    return {
        "method": "tou",
        "self_consumption_kwh": self_kwh,
        "import_cost": import_cost,
        "export_credit": export_credit,
        "self_consumption_value": self_value,
        "net_savings": net_savings,
        "import_rate": avg_rate,
        "export_rate": avg_rate,
        "nem_plan": config.nem_plan,
        "tou_schedule": config.schedule,
        "tou_periods": period_details,
    }


def _period_label(period: TouPeriod) -> str:
    return {
        "peak": "Peak",
        "off_peak": "Off peak",
        "super_off_peak": "Super off peak",
    }[period]
