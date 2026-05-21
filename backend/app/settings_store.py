from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
