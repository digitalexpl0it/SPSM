from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.health_rules import default_health_rule_keys
from app.models import AppSetting

# Keys stored in app_settings
KEYS = {
    "setup_complete": "false",
    "pvs_host": "",
    "pvs_serial": "",
    "pvs_verify_ssl": "false",
    "poll_interval_seconds": "60",
    "site_name": "",
    "site_id": "",
    "site_address": "",
    "collector_enabled": "true",
    "websocket_live": "false",
    "battery_enabled": "false",
    "inverter_gauge_max_w": "",
    "temp_unit": "f",
    "temp_warning": "",
    "temp_critical": "",
    "site_timezone": "America/Los_Angeles",
    "notify_enabled": "false",
    "notify_webhook_enabled": "false",
    "notify_ntfy_enabled": "false",
    "notify_smtp_enabled": "false",
    "notify_webhook_url": "",
    "notify_ntfy_topic": "",
    "notify_min_severity": "critical",
    "notify_smtp_host": "",
    "notify_smtp_port": "587",
    "notify_smtp_use_tls": "true",
    "notify_smtp_username": "",
    "notify_smtp_password": "",
    "notify_smtp_from": "",
    "notify_smtp_to": "",
    "portal_public_url": "",
    "monthly_report_enabled": "false",
    "monthly_report_last_sent": "",
    "co2_kg_per_kwh": "0.4",
    "electricity_import_rate": "",
    "electricity_export_rate": "",
    "nem_plan": "nem2",
    "rate_schedule_name": "",
    "tou_peak_rate": "",
    "tou_off_peak_rate": "",
    "tou_super_off_peak_rate": "",
    "tou_estimates_enabled": "false",
    "tou_schedule": "sce_tou_d_4_9",
    "temp_coefficient_pct_per_c": "-0.30",
    "derating_display_enabled": "false",
    "notify_quiet_hours_enabled": "false",
    "notify_quiet_start": "22:00",
    "notify_quiet_end": "07:00",
    "notify_quiet_allow_critical": "true",
    "health_sunrise_ramp_smart": "false",
    "data_retention_enabled": "false",
    "data_retention_years": "5",
    "data_retention_last_purge": "",
    **default_health_rule_keys(),
}


def inverter_gauge_max_w_from_settings(settings: dict[str, str]) -> int | None:
    """User override for inverter gauge full-scale (watts). None = auto from module type."""
    raw = (settings.get("inverter_gauge_max_w") or "").strip()
    if not raw:
        return None
    try:
        value = int(raw)
    except ValueError:
        return None
    return value if value > 0 else None


def battery_enabled_from_settings(settings: dict[str, str]) -> bool:
    return settings.get("battery_enabled", "false").lower() == "true"


def site_timezone_from_settings(settings: dict[str, str]) -> str:
    return (settings.get("site_timezone") or "").strip() or "America/Los_Angeles"


# Hot-climate typical panel temp → industry max rated (149°F / 65°C, 185°F / 85°C)
_DEFAULT_TEMP = {"f": (149, 185), "c": (65, 85)}


def _c_to_f(c: float) -> float:
    return c * 9 / 5 + 32


def temp_config_from_settings(settings: dict[str, str]) -> dict[str, int | str | bool]:
    """Heatsink unit + thresholds; values compared after normalizing to °F internally."""
    unit = (settings.get("temp_unit") or "f").strip().lower()
    if unit not in ("c", "f"):
        unit = "f"
    warn_def, crit_def = _DEFAULT_TEMP[unit]
    try:
        warn = int((settings.get("temp_warning") or "").strip())
    except ValueError:
        warn = 0
    try:
        crit = int((settings.get("temp_critical") or "").strip())
    except ValueError:
        crit = 0
    custom = warn > 0 or crit > 0
    warning = warn if warn > 0 else warn_def
    critical = crit if crit > 0 else crit_def
    if critical < warning:
        critical = warning + (crit_def - warn_def)
    warn_f = float(warning) if unit == "f" else _c_to_f(float(warning))
    crit_f = float(critical) if unit == "f" else _c_to_f(float(critical))
    return {
        "unit": unit,
        "warning": warning,
        "critical": critical,
        "warning_f": int(round(warn_f)),
        "critical_f": int(round(crit_f)),
        "custom": custom,
    }


async def get_setting(session: AsyncSession, key: str, default: str = "") -> str:
    row = await session.get(AppSetting, key)
    if row is None:
        return KEYS.get(key, default)
    return row.value


async def set_setting(session: AsyncSession, key: str, value: str) -> None:
    row = await session.get(AppSetting, key)
    if row is None:
        session.add(AppSetting(key=key, value=value))
    else:
        row.value = value


async def get_all_settings(session: AsyncSession) -> dict[str, str]:
    result = await session.execute(select(AppSetting))
    stored = {r.key: r.value for r in result.scalars()}
    out = dict(KEYS)
    out.update(stored)
    return out


async def is_setup_complete(session: AsyncSession) -> bool:
    host = await get_setting(session, "pvs_host")
    serial = await get_setting(session, "pvs_serial")
    complete = await get_setting(session, "setup_complete")
    return complete.lower() == "true" and bool(host.strip()) and bool(serial.strip())


def electricity_rate_from_settings(settings: dict[str, str], key: str) -> float:
    raw = (settings.get(key) or "").strip()
    if not raw:
        return 0.0
    try:
        return max(0.0, float(raw))
    except ValueError:
        return 0.0


VALID_NEM_PLANS = frozenset({"nem1", "nem2", "nem3", "custom"})


def nem_plan_from_settings(settings: dict[str, str]) -> str:
    raw = (settings.get("nem_plan") or "nem2").strip().lower()
    return raw if raw in VALID_NEM_PLANS else "custom"


def effective_electricity_rates(
    settings: dict[str, str],
) -> tuple[float, float, str]:
    """Return (import_rate, export_rate, nem_plan). NEM 1/2 use retail credit for exports."""
    import_rate = electricity_rate_from_settings(settings, "electricity_import_rate")
    export_rate = electricity_rate_from_settings(settings, "electricity_export_rate")
    plan = nem_plan_from_settings(settings)
    if plan in ("nem1", "nem2"):
        export_rate = import_rate
    return import_rate, export_rate, plan
