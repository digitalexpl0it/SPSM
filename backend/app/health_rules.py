"""Health alert rule catalog, enable flags, and tunable thresholds from app_settings."""

from __future__ import annotations

from typing import Any, Literal

Severity = Literal["info", "warning", "critical"]

# setting_key, default enabled, severity, title, description
RULE_CATALOG: list[dict[str, Any]] = [
    {
        "id": "pvs_offline",
        "setting_key": "health_rule_pvs_offline",
        "severity": "critical",
        "title": "PVS not reachable",
        "description": "Live login test to your PVS6 fails.",
        "tunables": [],
    },
    {
        "id": "no_readings",
        "setting_key": "health_rule_no_readings",
        "severity": "critical",
        "title": "No collected data",
        "description": "Collector enabled but no readings in the database yet.",
        "tunables": [],
    },
    {
        "id": "collector_stale",
        "setting_key": "health_rule_collector_stale",
        "severity": "warning",
        "title": "No recent readings",
        "description": "Gap since the last stored reading exceeds the threshold.",
        "tunables": [
            {
                "key": "health_no_data_gap_minutes",
                "label": "Stale after (minutes, 0 = auto)",
                "type": "int",
                "min": 0,
                "max": 120,
                "default": 0,
            },
        ],
    },
    {
        "id": "daylight_zero_pv",
        "setting_key": "health_rule_daylight_zero_pv",
        "severity": "warning",
        "title": "No solar production (daylight)",
        "description": "Site PV near zero during solar hours (skipped at sunrise/sunset ramp).",
        "tunables": [
            {
                "key": "health_daylight_zero_pv_minutes",
                "label": "Below threshold for (minutes)",
                "type": "int",
                "min": 15,
                "max": 180,
                "default": 45,
            },
            {
                "key": "health_daylight_zero_pv_kw",
                "label": "PV below (kW)",
                "type": "float",
                "min": 0.01,
                "max": 1.0,
                "step": 0.01,
                "default": 0.05,
            },
        ],
    },
    {
        "id": "production_drop",
        "setting_key": "health_rule_production_drop",
        "severity": "warning",
        "title": "Production dropped sharply",
        "description": "Recent PV average much lower than the prior window (mid-day only).",
        "tunables": [
            {
                "key": "health_production_drop_ratio_pct",
                "label": "Drop vs baseline (%)",
                "type": "int",
                "min": 20,
                "max": 80,
                "default": 45,
                "help": "Alert when recent avg falls below this percent of baseline.",
            },
        ],
    },
    {
        "id": "mid_state",
        "setting_key": "health_rule_mid_state",
        "severity": "info",
        "title": "MID / transfer switch state",
        "description": "Non-zero midstate in livedata.",
        "tunables": [],
    },
    {
        "id": "inverter_stuck",
        "setting_key": "health_rule_inverter_stuck",
        "severity": "warning",
        "title": "Inverter(s) not producing",
        "description": "One or more panels at ~0 W while others produce (daylight, 3+ inverters).",
        "tunables": [],
    },
    {
        "id": "temperature",
        "setting_key": "health_rule_temperature",
        "severity": "warning",
        "title": "Inverter temperature",
        "description": "Warm or critical heatsink temps (thresholds on System tab).",
        "tunables": [],
    },
    {
        "id": "inv_fault_flags",
        "setting_key": "health_rule_inv_fault_flags",
        "severity": "warning",
        "title": "Inverter fault / alarm fields",
        "description": "Non-zero fault, alarm, or error keys in inverter telemetry.",
        "tunables": [],
    },
    {
        "id": "sys_fault_flags",
        "setting_key": "health_rule_sys_fault_flags",
        "severity": "warning",
        "title": "System fault / alarm fields",
        "description": "Non-zero fault, alarm, or error keys in supervisor snapshot.",
        "tunables": [],
    },
]


def rule_enabled(settings: dict[str, str], setting_key: str) -> bool:
    default = "true"
    for rule in RULE_CATALOG:
        if rule["setting_key"] == setting_key:
            default = "true"
            break
    return settings.get(setting_key, default).lower() != "false"


def rule_enabled_by_id(settings: dict[str, str], rule_id: str) -> bool:
    for rule in RULE_CATALOG:
        if rule["id"] == rule_id:
            return rule_enabled(settings, rule["setting_key"])
    return True


def int_setting(settings: dict[str, str], key: str, default: int, *, min_v: int, max_v: int) -> int:
    raw = (settings.get(key) or "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return max(min_v, min(max_v, value))


def float_setting(
    settings: dict[str, str], key: str, default: float, *, min_v: float, max_v: float
) -> float:
    raw = (settings.get(key) or "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    return max(min_v, min(max_v, value))


def gap_minutes_from_settings(settings: dict[str, str], poll_s: int) -> int:
    configured = int_setting(settings, "health_no_data_gap_minutes", 0, min_v=0, max_v=120)
    auto = max(10, (poll_s * 2) // 60)
    return configured if configured > 0 else auto


def daylight_zero_pv_minutes(settings: dict[str, str]) -> int:
    return int_setting(settings, "health_daylight_zero_pv_minutes", 45, min_v=15, max_v=180)


def daylight_zero_pv_kw(settings: dict[str, str]) -> float:
    return float_setting(settings, "health_daylight_zero_pv_kw", 0.05, min_v=0.01, max_v=1.0)


def production_drop_ratio(settings: dict[str, str]) -> float:
    pct = int_setting(settings, "health_production_drop_ratio_pct", 45, min_v=20, max_v=80)
    return pct / 100.0


def catalog_for_api(settings: dict[str, str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for rule in RULE_CATALOG:
        entry = {
            "id": rule["id"],
            "setting_key": rule["setting_key"],
            "severity": rule["severity"],
            "title": rule["title"],
            "description": rule["description"],
            "enabled": rule_enabled(settings, rule["setting_key"]),
            "tunables": [],
        }
        for t in rule.get("tunables", []):
            key = t["key"]
            raw = settings.get(key, "")
            default = t["default"]
            if t["type"] == "int":
                current = int_setting(settings, key, int(default), min_v=t["min"], max_v=t["max"])
            else:
                current = float_setting(settings, key, float(default), min_v=t["min"], max_v=t["max"])
            entry["tunables"].append({**t, "value": current})
        out.append(entry)
    return out


def default_health_rule_keys() -> dict[str, str]:
    keys: dict[str, str] = {"health_last_persist": ""}
    for rule in RULE_CATALOG:
        keys[rule["setting_key"]] = "true"
    keys["health_daylight_zero_pv_minutes"] = "45"
    keys["health_daylight_zero_pv_kw"] = "0.05"
    keys["health_production_drop_ratio_pct"] = "45"
    keys["health_no_data_gap_minutes"] = "0"
    keys["health_sunrise_ramp_smart"] = "false"
    return keys
