"""Background collector — polls PVS and stores readings."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

import httpx
from sqlalchemy import select

from app.database import async_session, engine
from app.database import Base
from app.models import DeviceSnapshot, Reading
from app.pvs_client import PvsClient, parse_livedata
from app.rollup import upsert_rollups_for_reading
from app.settings_store import (
    battery_enabled_from_settings,
    get_all_settings,
    get_setting,
    site_timezone_from_settings,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("collector")


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def collect_once() -> None:
    async with async_session() as session:
        settings = await get_all_settings(session)
        if settings.get("collector_enabled", "true").lower() != "true":
            return

        host = settings.get("pvs_host", "").strip()
        serial = settings.get("pvs_serial", "").strip()
        if not host or not serial:
            logger.debug("PVS not configured, skipping")
            return

        interval = int(settings.get("poll_interval_seconds", "60"))
        verify = settings.get("pvs_verify_ssl", "false").lower() == "true"

        client = PvsClient(host=host, serial=serial, verify_ssl=verify)

        include_battery = battery_enabled_from_settings(settings)
        async with httpx.AsyncClient(verify=verify, timeout=45.0) as http:
            telemetry = await client.fetch_all_telemetry(http, include_battery=include_battery)

        livedata_raw = telemetry.get("livedata", {})
        parsed = parse_livedata(livedata_raw)
        now = datetime.now(UTC)

        reading = Reading(
            ts=now,
            pv_kw=parsed.get("pv_kw"),
            net_kw=parsed.get("net_kw"),
            load_kw=parsed.get("load_kw"),
            battery_kw=parsed.get("battery_kw"),
            battery_soc=parsed.get("battery_soc"),
            pv_kwh_total=parsed.get("pv_kwh_total"),
            net_kwh_total=parsed.get("net_kwh_total"),
            load_kwh_total=parsed.get("load_kwh_total"),
            battery_kwh_total=parsed.get("battery_kwh_total"),
            backup_minutes=parsed.get("backup_minutes"),
            mid_state=parsed.get("mid_state"),
        )
        session.add(reading)
        await session.flush()
        await upsert_rollups_for_reading(
            session, reading, site_timezone_from_settings(settings)
        )

        categories = [
            ("inverters", telemetry.get("inverters", {})),
            ("meters", telemetry.get("meters", {})),
            ("system", telemetry.get("system", {})),
        ]
        if include_battery:
            categories.insert(2, ("ess", telemetry.get("ess", {})))
        for category, payload in categories:
            if payload:
                session.add(
                    DeviceSnapshot(ts=now, category=category, payload=payload)
                )

        await session.commit()
        logger.info(
            "Collected pv=%.2f kW load=%.2f kW net=%.2f kW",
            parsed.get("pv_kw") or 0,
            parsed.get("load_kw") or 0,
            parsed.get("net_kw") or 0,
        )


async def run_loop():
    await init_db()
    logger.info("Collector started")
    while True:
        try:
            async with async_session() as session:
                interval = int(await get_setting(session, "poll_interval_seconds", "60"))
        except Exception:
            interval = 60

        try:
            await collect_once()
        except Exception as e:
            logger.exception("Collection failed: %s", e)

        await asyncio.sleep(max(10, interval))


if __name__ == "__main__":
    asyncio.run(run_loop())
