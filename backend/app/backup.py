"""Full portal backup export and restore for migration to a new install."""

from __future__ import annotations

import gzip
import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.json_util import sanitize_for_json
from app.models import (
    AppSetting,
    DeviceSnapshot,
    HealthEvent,
    Reading,
    ReadingRollup,
    User,
)
from app.settings_store import set_setting

BACKUP_VERSION = 1
BATCH_SIZE = 500


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).isoformat()


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


async def table_counts(db: AsyncSession) -> dict[str, int]:
    async def count(model: type) -> int:
        return int(await db.scalar(select(func.count()).select_from(model)) or 0)

    return {
        "app_settings": await count(AppSetting),
        "users": await count(User),
        "readings": await count(Reading),
        "device_snapshots": await count(DeviceSnapshot),
        "reading_rollups": await count(ReadingRollup),
        "health_events": await count(HealthEvent),
    }


async def build_backup_payload(db: AsyncSession) -> dict[str, Any]:
    settings_rows = await db.execute(select(AppSetting))
    app_settings = {r.key: r.value for r in settings_rows.scalars()}

    user_rows = await db.execute(select(User).order_by(User.id))
    users = [
        {
            "username": u.username,
            "password_hash": u.password_hash,
            "is_admin": u.is_admin,
            "created_at": _iso(u.created_at),
        }
        for u in user_rows.scalars()
    ]

    reading_rows = await db.execute(select(Reading).order_by(Reading.ts))
    readings = [
        {
            "ts": _iso(r.ts),
            "pv_kw": r.pv_kw,
            "net_kw": r.net_kw,
            "load_kw": r.load_kw,
            "battery_kw": r.battery_kw,
            "battery_soc": r.battery_soc,
            "pv_kwh_total": r.pv_kwh_total,
            "net_kwh_total": r.net_kwh_total,
            "load_kwh_total": r.load_kwh_total,
            "battery_kwh_total": r.battery_kwh_total,
            "backup_minutes": r.backup_minutes,
            "mid_state": r.mid_state,
        }
        for r in reading_rows.scalars()
    ]

    snap_rows = await db.execute(select(DeviceSnapshot).order_by(DeviceSnapshot.ts))
    device_snapshots = [
        {
            "ts": _iso(s.ts),
            "category": s.category,
            "payload": s.payload,
        }
        for s in snap_rows.scalars()
    ]

    rollup_rows = await db.execute(select(ReadingRollup).order_by(ReadingRollup.bucket_start))
    reading_rollups = [
        {
            "bucket_start": _iso(r.bucket_start),
            "bucket": r.bucket,
            "pv_kw_avg": r.pv_kw_avg,
            "net_kw_avg": r.net_kw_avg,
            "load_kw_avg": r.load_kw_avg,
            "battery_kw_avg": r.battery_kw_avg,
            "battery_soc_avg": r.battery_soc_avg,
            "pv_kwh_total_end": r.pv_kwh_total_end,
            "net_kwh_total_end": r.net_kwh_total_end,
            "load_kwh_total_end": r.load_kwh_total_end,
            "sample_count": r.sample_count,
        }
        for r in rollup_rows.scalars()
    ]

    health_rows = await db.execute(select(HealthEvent).order_by(HealthEvent.first_seen))
    health_events = [
        {
            "alert_id": h.alert_id,
            "severity": h.severity,
            "title": h.title,
            "message": h.message,
            "detail": h.detail,
            "first_seen": _iso(h.first_seen),
            "last_seen": _iso(h.last_seen),
            "resolved_at": _iso(h.resolved_at),
            "active": h.active,
            "last_notified_at": _iso(h.last_notified_at),
        }
        for h in health_rows.scalars()
    ]

    return sanitize_for_json(
        {
            "spsm_backup_version": BACKUP_VERSION,
            "exported_at": datetime.now(UTC).isoformat(),
            "app_settings": app_settings,
            "users": users,
            "readings": readings,
            "device_snapshots": device_snapshots,
            "reading_rollups": reading_rollups,
            "health_events": health_events,
            "counts": {
                "app_settings": len(app_settings),
                "users": len(users),
                "readings": len(readings),
                "device_snapshots": len(device_snapshots),
                "reading_rollups": len(reading_rollups),
                "health_events": len(health_events),
            },
        }
    )


def encode_backup_gzip(payload: dict[str, Any]) -> bytes:
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return gzip.compress(raw, compresslevel=6)


def decode_backup_file(data: bytes) -> dict[str, Any]:
    if data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    try:
        payload = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise ValueError("Invalid backup file — expected JSON or gzip-compressed JSON") from e
    if not isinstance(payload, dict):
        raise ValueError("Invalid backup format")
    version = payload.get("spsm_backup_version")
    if version != BACKUP_VERSION:
        raise ValueError(f"Unsupported backup version: {version!r} (expected {BACKUP_VERSION})")
    return payload


async def _clear_historical_data(db: AsyncSession) -> None:
    await db.execute(delete(HealthEvent))
    await db.execute(delete(ReadingRollup))
    await db.execute(delete(DeviceSnapshot))
    await db.execute(delete(Reading))


async def import_backup(
    db: AsyncSession,
    payload: dict[str, Any],
    *,
    import_settings: bool,
    import_historical_data: bool,
    import_users: bool,
    replace_existing: bool,
) -> dict[str, int]:
    imported: dict[str, int] = {
        "app_settings": 0,
        "users": 0,
        "readings": 0,
        "device_snapshots": 0,
        "reading_rollups": 0,
        "health_events": 0,
    }

    if replace_existing:
        await _clear_historical_data(db)
        if import_users:
            await db.execute(delete(User))
        if import_settings:
            await db.execute(delete(AppSetting))

    if import_settings:
        for key, value in (payload.get("app_settings") or {}).items():
            if isinstance(key, str) and value is not None:
                await set_setting(db, key, str(value))
                imported["app_settings"] += 1

    if import_users:
        for row in payload.get("users") or []:
            if not isinstance(row, dict) or not row.get("username") or not row.get("password_hash"):
                continue
            db.add(
                User(
                    username=str(row["username"]),
                    password_hash=str(row["password_hash"]),
                    is_admin=bool(row.get("is_admin", False)),
                )
            )
            imported["users"] += 1

    if import_historical_data:
        for batch in _chunks(payload.get("readings") or [], BATCH_SIZE):
            for row in batch:
                ts = _parse_dt(row.get("ts"))
                if not ts:
                    continue
                db.add(
                    Reading(
                        ts=ts,
                        pv_kw=row.get("pv_kw"),
                        net_kw=row.get("net_kw"),
                        load_kw=row.get("load_kw"),
                        battery_kw=row.get("battery_kw"),
                        battery_soc=row.get("battery_soc"),
                        pv_kwh_total=row.get("pv_kwh_total"),
                        net_kwh_total=row.get("net_kwh_total"),
                        load_kwh_total=row.get("load_kwh_total"),
                        battery_kwh_total=row.get("battery_kwh_total"),
                        backup_minutes=row.get("backup_minutes"),
                        mid_state=row.get("mid_state"),
                    )
                )
                imported["readings"] += 1
            await db.flush()

        for batch in _chunks(payload.get("device_snapshots") or [], BATCH_SIZE):
            for row in batch:
                ts = _parse_dt(row.get("ts"))
                if not ts or not row.get("category"):
                    continue
                db.add(
                    DeviceSnapshot(
                        ts=ts,
                        category=str(row["category"]),
                        payload=row.get("payload") or {},
                    )
                )
                imported["device_snapshots"] += 1
            await db.flush()

        for batch in _chunks(payload.get("reading_rollups") or [], BATCH_SIZE):
            for row in batch:
                bucket_start = _parse_dt(row.get("bucket_start"))
                if not bucket_start or not row.get("bucket"):
                    continue
                db.add(
                    ReadingRollup(
                        bucket_start=bucket_start,
                        bucket=str(row["bucket"]),
                        pv_kw_avg=row.get("pv_kw_avg"),
                        net_kw_avg=row.get("net_kw_avg"),
                        load_kw_avg=row.get("load_kw_avg"),
                        battery_kw_avg=row.get("battery_kw_avg"),
                        battery_soc_avg=row.get("battery_soc_avg"),
                        pv_kwh_total_end=row.get("pv_kwh_total_end"),
                        net_kwh_total_end=row.get("net_kwh_total_end"),
                        load_kwh_total_end=row.get("load_kwh_total_end"),
                        sample_count=int(row.get("sample_count") or 0),
                    )
                )
                imported["reading_rollups"] += 1
            await db.flush()

        for batch in _chunks(payload.get("health_events") or [], BATCH_SIZE):
            for row in batch:
                first_seen = _parse_dt(row.get("first_seen"))
                last_seen = _parse_dt(row.get("last_seen"))
                if not first_seen or not last_seen or not row.get("alert_id"):
                    continue
                db.add(
                    HealthEvent(
                        alert_id=str(row["alert_id"]),
                        severity=str(row.get("severity") or "info"),
                        title=str(row.get("title") or ""),
                        message=str(row.get("message") or ""),
                        detail=str(row.get("detail") or ""),
                        first_seen=first_seen,
                        last_seen=last_seen,
                        resolved_at=_parse_dt(row.get("resolved_at")),
                        active=bool(row.get("active", True)),
                        last_notified_at=_parse_dt(row.get("last_notified_at")),
                    )
                )
                imported["health_events"] += 1
            await db.flush()

    await db.commit()
    return imported


def _chunks(items: list[Any], size: int):
    for i in range(0, len(items), size):
        yield items[i : i + size]
