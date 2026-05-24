"""Parse PVS supervisor fields for health checks and diagnostics."""

from __future__ import annotations

import re
from typing import Any

from app.json_util import safe_float

_MB_IN_TEXT = re.compile(r"(\d+(?:\.\d+)?)\s*mb", re.I)


def _raw_value(payload: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in payload and payload[key] not in (None, "", "TBD"):
            return payload[key]
    return None


def parse_flash_free_mb(raw: Any) -> float | None:
    """Best-effort free flash storage in MB from varserver flash_usage."""
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    match = _MB_IN_TEXT.search(text)
    if match:
        return float(match.group(1))
    if "free" in text.lower():
        num = safe_float(text.split()[0] if text.split() else text)
        return num
    num = safe_float(text)
    if num is None:
        return None
    # Values above 100 are likely MB; 0–100 without MB hint are ambiguous (often % used).
    if num > 100:
        return num
    return None


def parse_flash_used_pct(raw: Any) -> float | None:
    if raw is None:
        return None
    text = str(raw).strip().rstrip("%")
    num = safe_float(text)
    if num is None:
        return None
    if num <= 100 and "%" in str(raw):
        return num
    if num <= 100 and "mb" not in str(raw).lower():
        return num
    return None


def parse_flash_wear_pct(raw: Any) -> float | None:
    if raw is None:
        return None
    text = str(raw).strip().rstrip("%")
    return safe_float(text)


def flash_metrics_from_system(payload: dict[str, Any] | None) -> dict[str, float | None]:
    if not payload:
        return {"flash_free_mb": None, "flash_used_pct": None, "flash_wear_pct": None}
    usage_raw = _raw_value(payload, "/sys/info/flash_usage", "flash_usage")
    wear_raw = _raw_value(payload, "/sys/pvs/flashwear_type_b", "flashwear_type_b")
    free_mb = parse_flash_free_mb(usage_raw)
    used_pct = parse_flash_used_pct(usage_raw) if free_mb is None else None
    return {
        "flash_free_mb": free_mb,
        "flash_used_pct": used_pct,
        "flash_wear_pct": parse_flash_wear_pct(wear_raw),
    }


def meter_data_status(
    *,
    meter_payload: dict[str, Any] | None,
    recent_load_values: list[float | None],
    recent_pv_values: list[float | None],
    daylight: bool,
) -> str | None:
    """Return a hint id when CT / consumption meter data looks missing."""
    has_meters = bool(meter_payload)
    if not has_meters:
        return "no_meter_snapshots"

    if not daylight or len(recent_pv_values) < 3:
        return None

    pv_peak = max((v or 0) for v in recent_pv_values)
    if pv_peak < 0.25:
        return None

    load_vals = [v for v in recent_load_values if v is not None]
    if not load_vals:
        return "load_missing"
    if max(load_vals) < 0.05 and pv_peak >= 0.25:
        return "load_zero_while_producing"
    return None


METER_HINTS: dict[str, str] = {
    "no_meter_snapshots": (
        "No consumption meter data from the PVS yet. Grid import/export and home load need CT "
        "clamps installed and provisioned in your electrical panel — ask your installer or "
        "check the SunPower app if values stay empty."
    ),
    "load_missing": (
        "Home load is not reported while solar is producing. Consumption CT clamps may be "
        "missing or not provisioned on the PVS."
    ),
    "load_zero_while_producing": (
        "Home load reads near zero during solar production. Verify consumption meter CTs are "
        "installed and configured (SunPower app → System Info, or contact your installer)."
    ),
}
