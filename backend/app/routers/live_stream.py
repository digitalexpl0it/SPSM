"""SSE live livedata when websocket_live is enabled (polls PVS)."""

from __future__ import annotations

import asyncio
import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import ALGORITHM
from app.config import settings as app_settings
from app.database import get_db
from app.models import User
from app.pvs_client import PvsClient, parse_livedata
from app.settings_store import battery_enabled_from_settings, get_all_settings

router = APIRouter(prefix="/api/live", tags=["live"])


async def _verify_stream_token(token: str, db: AsyncSession) -> None:
    try:
        payload = jwt.decode(token, app_settings.secret_key, algorithms=[ALGORITHM])
        username = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token") from None
    result = await db.execute(select(User).where(User.username == username))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=401, detail="Invalid user")


@router.get("/stream")
async def live_stream(
    db: Annotated[AsyncSession, Depends(get_db)],
    token: str = Query(..., description="JWT (EventSource cannot send Authorization header)"),
):
    await _verify_stream_token(token, db)
    settings = await get_all_settings(db)
    if settings.get("websocket_live", "false").lower() != "true":
        return StreamingResponse(
            iter([f"data: {json.dumps({'error': 'websocket_live disabled'})}\n\n"]),
            media_type="text/event-stream",
        )

    host = settings.get("pvs_host", "").strip()
    serial = settings.get("pvs_serial", "").strip()
    if not host or not serial:
        return StreamingResponse(
            iter([f"data: {json.dumps({'connected': False, 'error': 'PVS not configured'})}\n\n"]),
            media_type="text/event-stream",
        )

    verify = settings.get("pvs_verify_ssl", "false").lower() == "true"
    include_battery = battery_enabled_from_settings(settings)
    client = PvsClient(host=host, serial=serial, verify_ssl=verify)

    async def generate():
        import httpx
        from datetime import UTC, datetime

        while True:
            try:
                async with httpx.AsyncClient(verify=verify, timeout=20.0) as http:
                    telemetry = await client.fetch_all_telemetry(
                        http, include_battery=include_battery
                    )
                livedata = parse_livedata(telemetry.get("livedata", {}))
                payload = {
                    "connected": True,
                    "ts": datetime.now(UTC).isoformat(),
                    "livedata": livedata,
                    "battery_enabled": include_battery,
                }
            except Exception as e:
                payload = {"connected": False, "error": str(e)}

            yield f"data: {json.dumps(payload)}\n\n"
            await asyncio.sleep(5)

    return StreamingResponse(generate(), media_type="text/event-stream")
