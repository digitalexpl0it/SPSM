"""Admin backup export / import for migrating to a new SPSM install."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin, require_write_access
from app.backup import (
    build_backup_payload,
    decode_backup_file,
    encode_backup_gzip,
    import_backup,
    table_counts,
)
from app.database import get_db
from app.models import User

router = APIRouter(prefix="/api/backup", tags=["backup"])


@router.get("/stats")
async def backup_stats(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await table_counts(db)


@router.get("/export")
async def export_backup(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    payload = await build_backup_payload(db)
    body = encode_backup_gzip(payload)
    stamp = datetime.now(UTC).strftime("%Y%m%d")
    return Response(
        content=body,
        media_type="application/gzip",
        headers={
            "Content-Disposition": f'attachment; filename="spsm-backup-{stamp}.json.gz"',
        },
    )


@router.post("/import")
async def restore_backup(
    _: Annotated[User, Depends(require_admin)],
    __: Annotated[User, Depends(require_write_access)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
    import_settings: bool = Query(True),
    import_historical_data: bool = Query(True),
    import_users: bool = Query(False),
    replace_existing: bool = Query(True),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")
    raw = await file.read()
    if len(raw) > 512 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Backup file too large (max 512 MB)")
    try:
        payload = decode_backup_file(raw)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    if not import_settings and not import_historical_data and not import_users:
        raise HTTPException(
            status_code=400,
            detail="Enable at least one import option (settings, data, or users)",
        )

    if import_users and not replace_existing:
        raise HTTPException(
            status_code=400,
            detail="Importing users requires replace existing data to be enabled",
        )

    try:
        imported = await import_backup(
            db,
            payload,
            import_settings=import_settings,
            import_historical_data=import_historical_data,
            import_users=import_users,
            replace_existing=replace_existing,
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Import failed: {e}") from e

    return {
        "ok": True,
        "message": "Backup imported successfully",
        "imported": imported,
        "exported_at": payload.get("exported_at"),
    }
