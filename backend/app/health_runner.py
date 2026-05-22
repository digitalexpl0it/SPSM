"""Persist health alert transitions and fire notifications."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.health_checks import HealthAlert, evaluate_site_health
from app.models import HealthEvent
from app.notifier import send_notification, should_notify
from app.settings_store import get_all_settings


async def run_health_with_persistence(db: AsyncSession) -> dict:
    settings = await get_all_settings(db)
    report = await evaluate_site_health(db, settings)
    now = datetime.now(UTC)
    active_ids = {a["id"] for a in report.get("alerts", [])}

    result = await db.execute(select(HealthEvent).where(HealthEvent.active.is_(True)))
    open_events = {e.alert_id: e for e in result.scalars()}

    for alert_dict in report.get("alerts", []):
        alert = HealthAlert(
            id=alert_dict["id"],
            severity=alert_dict["severity"],
            title=alert_dict["title"],
            message=alert_dict["message"],
            detail=alert_dict.get("detail") or "",
        )
        existing = open_events.get(alert.id)
        if existing:
            existing.last_seen = now
            existing.severity = alert.severity
            existing.message = alert.message
            existing.detail = alert.detail or ""
            if should_notify(existing.last_notified_at):
                if await send_notification(
                    settings,
                    title=alert.title,
                    message=alert.message,
                    severity=alert.severity,
                    alert_id=alert.id,
                ):
                    existing.last_notified_at = now
        else:
            ev = HealthEvent(
                alert_id=alert.id,
                severity=alert.severity,
                title=alert.title,
                message=alert.message,
                detail=alert.detail or "",
                first_seen=now,
                last_seen=now,
                active=True,
            )
            db.add(ev)
            if await send_notification(
                settings,
                title=alert.title,
                message=alert.message,
                severity=alert.severity,
                alert_id=alert.id,
            ):
                ev.last_notified_at = now

    for alert_id, ev in open_events.items():
        if alert_id not in active_ids:
            ev.active = False
            ev.resolved_at = now

    await db.commit()
    return report
