"""Live PVS varserver access (admin)."""

from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.json_util import sanitize_for_json
from app.models import User
from app.pvs_client import PvsClient
from app.settings_store import get_all_settings

router = APIRouter(prefix="/api/pvs", tags=["pvs"])


def _normalize_var_prefix(prefix: str) -> dict[str, str]:
    """Map UI prefix to PVS varserver query params (match=, not path with slashes)."""
    p = prefix.strip().strip("/")
    if not p:
        return {"fmt": "obj", "cache": "sys"}
    match = p.split("/")[0] if "/" in p else p
    return {"match": match, "fmt": "obj", "cache": "sys"}


@router.get("/vars")
async def list_vars(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    prefix: str = Query("", max_length=256),
    pvs_host: str | None = Query(None),
    pvs_serial: str | None = Query(None),
    pvs_verify_ssl: bool | None = Query(None),
):
    settings = await get_all_settings(db)
    host = (pvs_host or settings.get("pvs_host") or "").strip()
    serial = (pvs_serial or settings.get("pvs_serial") or "").strip()
    if not host or not serial:
        return {"ok": False, "error": "PVS host and serial are required", "vars": {}, "count": 0}

    verify = (
        pvs_verify_ssl
        if pvs_verify_ssl is not None
        else settings.get("pvs_verify_ssl", "false").lower() == "true"
    )

    client = PvsClient(host=host, serial=serial, verify_ssl=verify)
    params = _normalize_var_prefix(prefix)
    try:
        async with httpx.AsyncClient(verify=client.verify_ssl, timeout=30.0) as http:
            raw = await client._get_vars(http, **params)
    except httpx.HTTPError as e:
        return {
            "ok": False,
            "error": f"PVS request failed: {e}",
            "vars": {},
            "count": 0,
            "prefix": prefix,
        }

    if not raw:
        return {
            "ok": True,
            "prefix": prefix,
            "vars": {},
            "count": 0,
            "error": "No data — try prefix sys, livedata, inverter, or meter",
        }

    return sanitize_for_json(
        {
            "ok": True,
            "prefix": prefix,
            "vars": raw,
            "count": len(raw) if isinstance(raw, dict) else 0,
        }
    )
