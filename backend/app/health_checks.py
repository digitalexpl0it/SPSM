"""Rule-based site health evaluation from DB readings and latest device snapshots."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.json_util import safe_float
from app.models import DeviceSnapshot, Reading
from app.pvs_client import PvsClient
from app.settings_store import site_timezone_from_settings, temp_config_from_settings
from app.timezone_util import is_daylight_local, is_sunset_ramp_local

logger = logging.getLogger(__name__)

Severity = Literal["info", "warning", "critical"]

# Tunable thresholds (future: move to app_settings)
NO_DATA_GAP_MINUTES = 10
DAYLIGHT_UTC_START = 14  # rough US solar window; site TZ would be better
DAYLIGHT_UTC_END = 22
DAYLIGHT_ZERO_PV_MINUTES = 45
DAYLIGHT_ZERO_PV_KW = 0.05
MIN_INVERTERS_FOR_STUCK_CHECK = 3
STUCK_PRODUCING_KW = 0.05
STUCK_ZERO_KW = 0.01
def _c_to_f(c: float) -> float:
    return c * 9 / 5 + 32


def _heatsink_to_f(raw: float, unit: str) -> float:
    if unit == "f":
        return raw
    return _c_to_f(raw)


PRODUCTION_DROP_RECENT_MIN = 15
PRODUCTION_DROP_BASELINE_MIN = 60
PRODUCTION_DROP_MIN_BASELINE_KW = 0.25
PRODUCTION_DROP_RATIO = 0.45


@dataclass
class HealthAlert:
    id: str
    severity: Severity
    title: str
    message: str
    detail: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "severity": self.severity,
            "title": self.title,
            "message": self.message,
            "detail": self.detail,
        }


def _is_daylight(now: datetime, settings: dict[str, str]) -> bool:
    tz = site_timezone_from_settings(settings)
    if tz:
        return is_daylight_local(tz, now)
    h = now.astimezone(UTC).hour
    return DAYLIGHT_UTC_START <= h < DAYLIGHT_UTC_END


def _inv_power_kw(fields: dict[str, Any]) -> float:
    for key in ("pMppt1Kw", "p3phsumKw", "pMppt1kw", "p3phsumkw"):
        v = safe_float(fields.get(key))
        if v is not None:
            return v
    return 0.0


def _inv_temp_c(fields: dict[str, Any]) -> float | None:
    for key in ("tHtsnkDegc", "tHtsnkdegc"):
        v = safe_float(fields.get(key))
        if v is not None:
            return v
    return None


def _inv_label(path: str, fields: dict[str, Any]) -> str:
    sn = fields.get("sn") or fields.get("SN")
    if sn:
        return str(sn)
    m = path.rsplit("/", 1)
    return f"Inverter {m[-1]}" if m else path


async def _pvs_login_ok(settings: dict[str, str]) -> tuple[bool, str]:
    host = (settings.get("pvs_host") or "").strip()
    serial = (settings.get("pvs_serial") or "").strip()
    if not host or not serial:
        return False, "PVS not configured in Settings"
    verify = settings.get("pvs_verify_ssl", "false").lower() == "true"
    client = PvsClient(host=host, serial=serial, verify_ssl=verify)
    try:
        async with httpx.AsyncClient(verify=verify, timeout=10.0) as http:
            if await client.login(http):
                return True, ""
            return False, "Authentication failed — check IP and serial"
    except httpx.HTTPError as e:
        logger.debug("PVS health ping failed: %s", e)
        return False, f"Cannot reach PVS at {host}"


async def evaluate_site_health(
    db: AsyncSession,
    settings: dict[str, str],
) -> dict[str, Any]:
    now = datetime.now(UTC)
    alerts: list[HealthAlert] = []
    ok_items: list[str] = []

    poll_s = int(settings.get("poll_interval_seconds") or "60")
    collector_on = settings.get("collector_enabled", "true").lower() != "false"
    gap_minutes = max(NO_DATA_GAP_MINUTES, (poll_s * 2) // 60)
    temp_cfg = temp_config_from_settings(settings)
    temp_unit = str(temp_cfg["unit"])
    warn_f = int(temp_cfg["warning_f"])
    crit_f = int(temp_cfg["critical_f"])
    warn_display = int(temp_cfg["warning"])
    crit_display = int(temp_cfg["critical"])
    unit_suffix = "F" if temp_unit == "f" else "C"

    # --- Latest reading ---
    result = await db.execute(select(Reading).order_by(Reading.ts.desc()).limit(1))
    latest: Reading | None = result.scalar_one_or_none()

    # --- PVS reachability (live ping) ---
    pvs_ok, pvs_err = await _pvs_login_ok(settings)
    if not pvs_ok:
        alerts.append(
            HealthAlert(
                id="pvs_offline",
                severity="critical",
                title="PVS not reachable",
                message=pvs_err,
                detail="The portal cannot log in to your PVS6 right now. Check network, IP, and serial in Settings.",
            )
        )
    else:
        ok_items.append("PVS is reachable on your network")

    # --- Collector / readings gap ---
    if collector_on:
        if latest is None:
            alerts.append(
                HealthAlert(
                    id="no_readings",
                    severity="critical",
                    title="No collected data yet",
                    message="The background collector has not stored any readings.",
                    detail="Confirm the collector is enabled and PVS connection works in Settings.",
                )
            )
        else:
            latest_ts = latest.ts if latest.ts.tzinfo else latest.ts.replace(tzinfo=UTC)
            age = now - latest_ts
            if age > timedelta(minutes=gap_minutes):
                mins = int(age.total_seconds() // 60)
                alerts.append(
                    HealthAlert(
                        id="collector_stale",
                        severity="critical" if mins > gap_minutes * 2 else "warning",
                        title="No recent readings",
                        message=f"Last data point was {mins} minutes ago (expected every ~{poll_s}s).",
                        detail="The collector may be stopped or unable to reach the PVS.",
                    )
                )
            else:
                ok_items.append(f"Collector active (last reading {int(age.total_seconds())}s ago)")
    elif not pvs_ok:
        pass
    else:
        ok_items.append("Background collector is disabled")

    # --- Readings in last hour for PV rules ---
    since = now - timedelta(hours=2)
    result = await db.execute(
        select(Reading).where(Reading.ts >= since).order_by(Reading.ts.asc())
    )
    recent_rows = list(result.scalars().all())

    # --- Daytime zero production ---
    if _is_daylight(now, settings) and recent_rows:
        window_start = now - timedelta(minutes=DAYLIGHT_ZERO_PV_MINUTES)
        window_rows = [r for r in recent_rows if (r.ts if r.ts.tzinfo else r.ts.replace(tzinfo=UTC)) >= window_start]
        if len(window_rows) >= 3:
            peak = max(safe_float(r.pv_kw) or 0 for r in window_rows)
            if peak < DAYLIGHT_ZERO_PV_KW:
                alerts.append(
                    HealthAlert(
                        id="daylight_zero_pv",
                        severity="warning",
                        title="No solar production (daylight)",
                        message=(
                            f"Site PV has been below {DAYLIGHT_ZERO_PV_KW} kW for about "
                            f"{DAYLIGHT_ZERO_PV_MINUTES} minutes during expected solar hours."
                        ),
                        detail="Could be cloudy weather, shutdown, or a system issue. Compare inverters and check the PVS.",
                    )
                )

    # --- Sudden production drop (mid-day only; skip normal sunset ramp) ---
    tz_name = site_timezone_from_settings(settings)
    if (
        len(recent_rows) >= 5
        and _is_daylight(now, settings)
        and not is_sunset_ramp_local(tz_name, now)
    ):
        recent_cut = now - timedelta(minutes=PRODUCTION_DROP_RECENT_MIN)
        base_end = now - timedelta(minutes=PRODUCTION_DROP_RECENT_MIN)
        base_start = now - timedelta(minutes=PRODUCTION_DROP_BASELINE_MIN)

        def avg_pv(rows: list[Reading]) -> float:
            vals = [safe_float(r.pv_kw) for r in rows]
            nums = [v for v in vals if v is not None]
            return sum(nums) / len(nums) if nums else 0.0

        recent_avg = avg_pv(
            [r for r in recent_rows if (r.ts if r.ts.tzinfo else r.ts.replace(tzinfo=UTC)) >= recent_cut]
        )
        baseline_avg = avg_pv(
            [
                r
                for r in recent_rows
                if base_start
                <= (r.ts if r.ts.tzinfo else r.ts.replace(tzinfo=UTC))
                < base_end
            ]
        )
        if (
            baseline_avg >= PRODUCTION_DROP_MIN_BASELINE_KW
            and recent_avg < baseline_avg * PRODUCTION_DROP_RATIO
        ):
            alerts.append(
                HealthAlert(
                    id="production_drop",
                    severity="warning",
                    title="Production dropped sharply",
                    message=(
                        f"Recent average {recent_avg:.2f} kW vs {baseline_avg:.2f} kW "
                        f"in the prior window (~{PRODUCTION_DROP_BASELINE_MIN - PRODUCTION_DROP_RECENT_MIN} min)."
                    ),
                    detail=(
                        "May be clouds passing, inverter fault, or grid event. "
                        "Ignored during the last few hours before sunset (normal ramp-down)."
                    ),
                )
            )

    # --- MID / transfer switch state ---
    if latest and latest.mid_state is not None and latest.mid_state != 0:
        alerts.append(
            HealthAlert(
                id="mid_state",
                severity="info",
                title="MID / transfer switch state",
                message=f"Livedata midstate value is {latest.mid_state}.",
                detail="Non-zero midstate may indicate grid transition or backup mode — see SunPower docs for your firmware.",
            )
        )

    # --- Latest inverter snapshot ---
    inv_result = await db.execute(
        select(DeviceSnapshot)
        .where(DeviceSnapshot.category == "inverters")
        .order_by(DeviceSnapshot.ts.desc())
        .limit(1)
    )
    inv_snap = inv_result.scalar_one_or_none()
    if inv_snap and isinstance(inv_snap.payload, dict):
        inverters = inv_snap.payload
        powers: list[tuple[str, float, float | None]] = []
        for path, fields in inverters.items():
            if not isinstance(fields, dict):
                continue
            powers.append((_inv_label(str(path), fields), _inv_power_kw(fields), _inv_temp_c(fields)))

        if _is_daylight(now, settings) and len(powers) >= MIN_INVERTERS_FOR_STUCK_CHECK:
            producing = [p for p in powers if p[1] >= STUCK_PRODUCING_KW]
            idle = [p for p in powers if p[1] < STUCK_ZERO_KW]
            if len(producing) >= 2 and idle:
                names = ", ".join(p[0][:20] for p in idle[:4])
                extra = f" (+{len(idle) - 4} more)" if len(idle) > 4 else ""
                alerts.append(
                    HealthAlert(
                        id="inverter_stuck",
                        severity="warning",
                        title="Inverter(s) not producing",
                        message=f"{len(idle)} panel(s) at ~0 W while {len(producing)} others are producing.",
                        detail=f"Check: {names}{extra}",
                    )
                )

        warm: list[tuple[str, float, float]] = []
        hot: list[tuple[str, float, float]] = []
        for label, _kw, temp in powers:
            if temp is None:
                continue
            tf = _heatsink_to_f(temp, temp_unit)
            if tf >= crit_f:
                hot.append((label, temp, tf))
            elif tf >= warn_f:
                warm.append((label, temp, tf))

        def _temp_line(lbl: str, raw: float) -> str:
            return f"{lbl} {int(raw)}°{unit_suffix}"

        if hot:
            lines = ", ".join(_temp_line(lbl, tc) for lbl, tc, _ in hot[:8])
            extra = f" (+{len(hot) - 8} more)" if len(hot) > 8 else ""
            alerts.append(
                HealthAlert(
                    id="temp_critical",
                    severity="critical",
                    title="High inverter temperature",
                    message=(
                        f"{len(hot)} inverter(s) at or above {crit_display}°{unit_suffix}."
                    ),
                    detail=f"{lines}{extra}",
                )
            )
        elif warm:
            lines = ", ".join(_temp_line(lbl, tc) for lbl, tc, _ in warm[:8])
            extra = f" (+{len(warm) - 8} more)" if len(warm) > 8 else ""
            alerts.append(
                HealthAlert(
                    id="temp_warning",
                    severity="warning",
                    title="Warm inverter",
                    message=(
                        f"{len(warm)} inverter(s) at or above {warn_display}°{unit_suffix}."
                    ),
                    detail=f"{lines}{extra}",
                )
            )

        # Scan payload for fault-like keys (cap to avoid noise)
        fault_count = 0
        for path, fields in inverters.items():
            if not isinstance(fields, dict) or fault_count >= 5:
                continue
            slug = re.sub(r"[^a-z0-9]+", "_", str(path).lower())[:48]
            for key, val in fields.items():
                if fault_count >= 5:
                    break
                kl = str(key).lower()
                if not any(x in kl for x in ("fault", "alarm", "error", "fail")):
                    continue
                if val in (None, "", 0, "0", False):
                    continue
                fault_count += 1
                alerts.append(
                    HealthAlert(
                        id=f"inv_flag_{slug}_{key}",
                        severity="warning",
                        title="Inverter status flag",
                        message=f"{_inv_label(str(path), fields)}: {key} = {val}",
                        detail="From latest PVS inverter telemetry — confirm meaning in varserver docs.",
                    )
                )

    # --- System snapshot fault scan ---
    sys_result = await db.execute(
        select(DeviceSnapshot)
        .where(DeviceSnapshot.category == "system")
        .order_by(DeviceSnapshot.ts.desc())
        .limit(1)
    )
    sys_snap = sys_result.scalar_one_or_none()
    if sys_snap and isinstance(sys_snap.payload, dict):
        for key, val in sys_snap.payload.items():
            kl = str(key).lower()
            if not any(x in kl for x in ("fault", "alarm", "error", "fail")):
                continue
            if val in (None, "", 0, "0", False):
                continue
            alerts.append(
                HealthAlert(
                    id=f"sys_flag_{key}",
                    severity="warning",
                    title="System status flag",
                    message=f"{key} = {val}",
                    detail="From latest supervisor snapshot.",
                )
            )

    if not alerts and pvs_ok:
        ok_items.append("No issues detected by current health rules")

    order = {"critical": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda a: order[a.severity])

    return sanitize_health(
        {
            "checked_at": now.isoformat(),
            "pvs_connected": pvs_ok,
            "collector_enabled": collector_on,
            "latest_reading_at": (
                (latest.ts if latest.ts.tzinfo else latest.ts.replace(tzinfo=UTC)).isoformat()
                if latest
                else None
            ),
            "temp_config": {
                "unit": temp_unit,
                "warning": warn_display,
                "critical": crit_display,
            },
            "alerts": [a.to_dict() for a in alerts],
            "ok": ok_items,
            "summary": _summary(alerts),
        }
    )


def _summary(alerts: list[HealthAlert]) -> str:
    if not alerts:
        return "healthy"
    if any(a.severity == "critical" for a in alerts):
        return "critical"
    if any(a.severity == "warning" for a in alerts):
        return "warning"
    return "info"


def sanitize_health(data: dict[str, Any]) -> dict[str, Any]:
    from app.json_util import sanitize_for_json

    return sanitize_for_json(data)
