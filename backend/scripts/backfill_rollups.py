#!/usr/bin/env python3
"""Rebuild reading_rollups from raw readings. Run inside api container or with DATABASE_URL set."""

import asyncio

from app.database import async_session, engine
from app.database import Base
from app.rollup import backfill_rollups_from_readings
from app.settings_store import get_all_settings, site_timezone_from_settings


async def main() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_session() as session:
        settings = await get_all_settings(session)
        tz = site_timezone_from_settings(settings)
        n = await backfill_rollups_from_readings(session, tz)
        await session.commit()
        print(f"Backfilled rollups from {n} readings (tz={tz})")


if __name__ == "__main__":
    asyncio.run(main())
