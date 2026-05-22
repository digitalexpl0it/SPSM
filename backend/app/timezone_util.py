"""Site timezone helpers for local-day boundaries and solar-hour checks."""

from __future__ import annotations

from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULT_TIMEZONE = "America/Los_Angeles"
DAYLIGHT_START_HOUR = 6
DAYLIGHT_END_HOUR = 20
# Skip “sharp drop” alerts in the late-day ramp (normal sunset, not clouds).
SUNSET_RAMP_HOURS_BEFORE_END = 3


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
