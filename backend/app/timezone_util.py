"""Site timezone helpers for local-day boundaries and solar-hour checks."""

from __future__ import annotations

from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULT_TIMEZONE = "America/Los_Angeles"
DAYLIGHT_START_HOUR = 6
DAYLIGHT_END_HOUR = 20
# Skip “sharp drop” alerts in the late-day ramp (normal sunset, not clouds).
SUNSET_RAMP_HOURS_BEFORE_END = 3
# Skip “no production” alerts while the array is still waking up after dawn.
SUNRISE_RAMP_HOURS_AFTER_START = 3

# Extra morning ramp hours by calendar month when health_sunrise_ramp_smart is enabled.
_SMART_SUNRISE_RAMP_BY_MONTH: dict[int, int] = {
    1: 4,
    2: 4,
    3: 3,
    4: 3,
    5: 2,
    6: 2,
    7: 2,
    8: 2,
    9: 3,
    10: 3,
    11: 4,
    12: 4,
}


def sunrise_ramp_hours(settings: dict[str, str] | None, local_month: int) -> int:
    if settings and settings.get("health_sunrise_ramp_smart", "false").lower() == "true":
        return _SMART_SUNRISE_RAMP_BY_MONTH.get(local_month, SUNRISE_RAMP_HOURS_AFTER_START)
    return SUNRISE_RAMP_HOURS_AFTER_START


def resolve_timezone(raw: str | None) -> ZoneInfo:
    name = (raw or "").strip() or DEFAULT_TIMEZONE
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return ZoneInfo(DEFAULT_TIMEZONE)


def local_day_bounds(
    tz_name: str | None,
    now: datetime | None = None,
) -> tuple[datetime, datetime]:
    """UTC range [start, end) for the current calendar day in site timezone."""
    now = now or datetime.now(UTC)
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)
    tz = resolve_timezone(tz_name)
    local = now.astimezone(tz)
    start_local = datetime.combine(local.date(), time.min, tzinfo=tz)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(UTC), end_local.astimezone(UTC)


def is_daylight_local(tz_name: str | None, now: datetime | None = None) -> bool:
    now = now or datetime.now(UTC)
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)
    h = now.astimezone(resolve_timezone(tz_name)).hour
    return DAYLIGHT_START_HOUR <= h < DAYLIGHT_END_HOUR


def is_sunrise_ramp_local(
    tz_name: str | None,
    now: datetime | None = None,
    settings: dict[str, str] | None = None,
) -> bool:
    """Early daylight hours when near-zero PV is normal as the sun comes up."""
    now = now or datetime.now(UTC)
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)
    local = now.astimezone(resolve_timezone(tz_name))
    h = local.hour
    ramp_hours = sunrise_ramp_hours(settings, local.month)
    ramp_end = DAYLIGHT_START_HOUR + ramp_hours
    return DAYLIGHT_START_HOUR <= h < ramp_end


def is_sunset_ramp_local(tz_name: str | None, now: datetime | None = None) -> bool:
    """Late daylight hours when PV normally falls — not used for sudden-drop alerts."""
    now = now or datetime.now(UTC)
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)
    h = now.astimezone(resolve_timezone(tz_name)).hour
    ramp_start = DAYLIGHT_END_HOUR - SUNSET_RAMP_HOURS_BEFORE_END
    return ramp_start <= h < DAYLIGHT_END_HOUR


def local_date_key(ts: datetime, tz_name: str | None) -> str:
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=UTC)
    return ts.astimezone(resolve_timezone(tz_name)).date().isoformat()
