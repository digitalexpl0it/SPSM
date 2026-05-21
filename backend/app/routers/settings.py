from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.pvs_client import PvsClient
from app.settings_store import get_all_settings, get_setting, is_setup_complete, set_setting

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsUpdate(BaseModel):
    pvs_host: str | None = None
    pvs_serial: str | None = None
    pvs_verify_ssl: bool | None = None
    poll_interval_seconds: int | None = Field(None, ge=10, le=3600)
    site_name: str | None = None
    site_id: str | None = None
    site_address: str | None = None
    collector_enabled: bool | None = None
    websocket_live: bool | None = None
    battery_enabled: bool | None = None
    inverter_gauge_max_w: int | None = Field(None, ge=0, le=600)
    temp_unit: str | None = Field(None, pattern="^(c|f)$")
    temp_warning: int | None = Field(None, ge=0, le=250)
    temp_critical: int | None = Field(None, ge=0, le=250)
    setup_complete: bool | None = None


class TestConnectionRequest(BaseModel):
    pvs_host: str
    pvs_serial: str
    pvs_verify_ssl: bool = False


@router.get("")
async def get_settings(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    settings = await get_all_settings(db)
    settings["setup_complete"] = str(await is_setup_complete(db)).lower()
    return settings


@router.put("")
async def update_settings(
    body: SettingsUpdate,
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    mapping: dict[str, Any] = body.model_dump(exclude_none=True)
    bool_keys = {
        "pvs_verify_ssl",
        "collector_enabled",
        "websocket_live",
        "battery_enabled",
        "setup_complete",
    }
    for key, value in mapping.items():
        if key in bool_keys:
            await set_setting(db, key, "true" if value else "false")
        elif key == "inverter_gauge_max_w":
            n = int(value) if value is not None else 0
            await set_setting(db, key, "" if n <= 0 else str(n))
        elif key in ("temp_warning", "temp_critical"):
            n = int(value) if value is not None else 0
            await set_setting(db, key, "" if n <= 0 else str(n))
        elif key == "temp_unit":
            u = str(value).lower() if value else "f"
            await set_setting(db, key, u if u in ("c", "f") else "f")
        else:
            await set_setting(db, key, str(value))

    if body.pvs_host and body.pvs_serial:
        await set_setting(db, "setup_complete", "true")

    await db.commit()
    settings = await get_all_settings(db)
    settings["setup_complete"] = str(await is_setup_complete(db)).lower()
    return settings


@router.post("/test-pvs")
async def test_pvs(
    body: TestConnectionRequest,
    _: Annotated[User, Depends(get_current_user)],
):
    client = PvsClient(
        host=body.pvs_host,
        serial=body.pvs_serial,
        verify_ssl=body.pvs_verify_ssl,
    )
    ok, message, data = await client.test_connection()
    if not ok:
        raise HTTPException(status_code=400, detail=message)
    return {"ok": True, "message": message, "data": data}
