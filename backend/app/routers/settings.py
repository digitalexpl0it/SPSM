from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, require_admin, require_write_access
from app.config import settings as app_config
from app.network_discovery import scan_pvs_subnet
from app.database import get_db
from app.models import User
from app.monthly_report import send_monthly_report_now
from app.notifier import explain_notification_block, send_notification, smtp_ready_for_reports
from app.pvs_client import PvsClient
from app.settings_store import get_all_settings, get_setting, is_setup_complete, set_setting
from app.timezone_util import DEFAULT_TIMEZONE

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
    site_timezone: str | None = Field(None, max_length=64)
    notify_enabled: bool | None = None
    notify_webhook_enabled: bool | None = None
    notify_ntfy_enabled: bool | None = None
    notify_smtp_enabled: bool | None = None
    notify_webhook_url: str | None = None
    notify_ntfy_topic: str | None = None
    notify_min_severity: str | None = Field(None, pattern="^(warning|critical)$")
    notify_smtp_host: str | None = None
    notify_smtp_port: int | None = Field(None, ge=1, le=65535)
    notify_smtp_use_tls: bool | None = None
    notify_smtp_username: str | None = None
    notify_smtp_password: str | None = None
    notify_smtp_from: str | None = None
    notify_smtp_to: str | None = None
    portal_public_url: str | None = None
    monthly_report_enabled: bool | None = None
    co2_kg_per_kwh: float | None = Field(None, ge=0, le=2)
    electricity_import_rate: float | None = Field(None, ge=0, le=10)
    electricity_export_rate: float | None = Field(None, ge=0, le=10)
    nem_plan: str | None = Field(None, pattern="^(nem1|nem2|nem3|custom)$")
    rate_schedule_name: str | None = Field(None, max_length=128)
    tou_peak_rate: float | None = Field(None, ge=0, le=10)
    tou_off_peak_rate: float | None = Field(None, ge=0, le=10)
    tou_super_off_peak_rate: float | None = Field(None, ge=0, le=10)
    tou_estimates_enabled: bool | None = None
    tou_schedule: str | None = Field(None, pattern="^(sce_tou_d_4_9|all_off_peak)$")
    temp_coefficient_pct_per_c: float | None = Field(None, ge=-1, le=0)
    derating_display_enabled: bool | None = None
    notify_quiet_hours_enabled: bool | None = None
    notify_quiet_start: str | None = Field(None, max_length=8)
    notify_quiet_end: str | None = Field(None, max_length=8)
    notify_quiet_allow_critical: bool | None = None
    health_sunrise_ramp_smart: bool | None = None
    setup_complete: bool | None = None


class TestNotifyRequest(BaseModel):
    notify_enabled: bool | None = None
    notify_webhook_enabled: bool | None = None
    notify_ntfy_enabled: bool | None = None
    notify_smtp_enabled: bool | None = None
    notify_webhook_url: str | None = None
    notify_ntfy_topic: str | None = None
    notify_min_severity: str | None = Field(None, pattern="^(warning|critical)$")
    notify_smtp_host: str | None = None
    notify_smtp_port: int | None = Field(None, ge=1, le=65535)
    notify_smtp_use_tls: bool | None = None
    notify_smtp_username: str | None = None
    notify_smtp_password: str | None = None
    notify_smtp_from: str | None = None
    notify_smtp_to: str | None = None


class TestConnectionRequest(BaseModel):
    pvs_host: str
    pvs_serial: str
    pvs_verify_ssl: bool = False


class DiscoverPvsRequest(BaseModel):
    seed_host: str | None = Field(None, max_length=128)


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
    _: Annotated[User, Depends(require_write_access)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    mapping: dict[str, Any] = body.model_dump(exclude_none=True)
    bool_keys = {
        "pvs_verify_ssl",
        "collector_enabled",
        "websocket_live",
        "battery_enabled",
        "notify_enabled",
        "notify_webhook_enabled",
        "notify_ntfy_enabled",
        "notify_smtp_enabled",
        "notify_smtp_use_tls",
        "notify_quiet_hours_enabled",
        "notify_quiet_allow_critical",
        "monthly_report_enabled",
        "derating_display_enabled",
        "health_sunrise_ramp_smart",
        "tou_estimates_enabled",
        "setup_complete",
    }

    if mapping.get("monthly_report_enabled"):
        snapshot = await get_all_settings(db)
        for key, value in mapping.items():
            if key in bool_keys:
                snapshot[key] = "true" if value else "false"
            elif key == "notify_smtp_port":
                snapshot[key] = str(int(value)) if value is not None else "587"
            elif value is not None:
                snapshot[key] = str(value)
        if not smtp_ready_for_reports(snapshot):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Monthly report requires SMTP to be configured (host, from, and to addresses) "
                    "before it can be enabled."
                ),
            )

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
        elif key == "site_timezone":
            tz = (str(value).strip() if value else "") or DEFAULT_TIMEZONE
            await set_setting(db, key, tz)
        elif key == "nem_plan":
            plan = (str(value).strip().lower() if value else "") or "nem2"
            await set_setting(
                db, key, plan if plan in ("nem1", "nem2", "nem3", "custom") else "custom"
            )
        elif key == "tou_schedule":
            sched = (str(value).strip().lower() if value else "") or "sce_tou_d_4_9"
            await set_setting(
                db,
                key,
                sched if sched in ("sce_tou_d_4_9", "all_off_peak") else "sce_tou_d_4_9",
            )
        elif key in (
            "co2_kg_per_kwh",
            "temp_coefficient_pct_per_c",
            "electricity_import_rate",
            "electricity_export_rate",
            "tou_peak_rate",
            "tou_off_peak_rate",
            "tou_super_off_peak_rate",
        ):
            await set_setting(db, key, str(value))
        elif key == "notify_smtp_port":
            await set_setting(db, key, str(int(value)) if value is not None else "587")
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


def _merge_notify_settings(
    base: dict[str, str], overrides: dict[str, Any]
) -> dict[str, str]:
    merged = dict(base)
    bool_keys = {
        "notify_enabled",
        "notify_webhook_enabled",
        "notify_ntfy_enabled",
        "notify_smtp_enabled",
        "notify_smtp_use_tls",
    }
    for key, value in overrides.items():
        if value is None:
            continue
        if key in bool_keys:
            merged[key] = "true" if value else "false"
        elif key == "notify_smtp_port":
            merged[key] = str(int(value))
        else:
            merged[key] = str(value)
    return merged


@router.post("/test-notify")
async def test_notify(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    body: TestNotifyRequest | None = None,
):
    settings = await get_all_settings(db)
    if body is not None:
        settings = _merge_notify_settings(
            settings, body.model_dump(exclude_none=True)
        )
    block = explain_notification_block(settings, is_test=True)
    if block:
        raise HTTPException(status_code=400, detail=block)

    ok = await send_notification(
        settings,
        title="Alert preview",
        message="Sample alert — see email for Warning and Critical examples.",
        severity="warning",
        alert_id="test",
        is_test=True,
    )
    if not ok:
        raise HTTPException(
            status_code=400,
            detail=(
                "Notification could not be delivered. Check host, credentials, and recipient "
                "for your enabled channel(s), then try again. See API logs for SMTP/webhook errors."
            ),
        )
    return {"ok": True, "message": "Test notification sent"}


@router.post("/test-monthly-report")
async def test_monthly_report(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    ok, message = await send_monthly_report_now(db)
    if not ok:
        raise HTTPException(status_code=400, detail=message)
    return {"ok": True, "message": message}


@router.post("/discover-pvs")
async def discover_pvs(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    body: DiscoverPvsRequest | None = None,
):
    explicit_seed = (body.seed_host if body and body.seed_host else "").strip()
    try:
        result = await scan_pvs_subnet(explicit_seed or None)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {
        "ok": True,
        "seed_host": result["seed_host"],
        "subnet": result["subnet"],
        "hosts": result["hosts"],
    }
