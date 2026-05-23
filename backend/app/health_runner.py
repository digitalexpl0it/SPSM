"""Persist health alert transitions and fire notifications."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.health_checks import HealthAlert, evaluate_site_health
from app.models import HealthEvent
from app.notifier import send_notification, should_notify
from app.settings_store import get_all_settings, get_setting, set_setting

HEALTH_PERSIST_INTERVAL_SECONDS = 300


async def run_health_with_persistence(db: AsyncSession) -> dict:
    settings = await get_all_settings(db)
    report = await evaluate_site_health(db, settings)
    now = datetime.now(UTC)
    active_ids = {a["id"] for a in report.get("alerts", [])}

    result = await db.execute(select(HealthEvent).where(HealthEvent.active.is_(True)))
    open_events = list(result.scalars())

    for alert_dict in report.get("alerts", []):
        alert = HealthAlert(
            id=alert_dict["id"],
            severity=alert_dict["severity"],
            title=alert_dict["title"],
            message=alert_dict["message"],
            detail=alert_dict.get("detail") or "",
        )
        active_for_id = [e for e in open_events if e.alert_id == alert.id and e.active]
        existing = active_for_id[0] if active_for_id else None

        if existing:
            existing.last_seen = now
            existing.severity = alert.severity
            existing.title = alert.title
            existing.message = alert.message
            existing.detail = alert.detail or ""
            acked = existing.acknowledged_at is not None
            if should_notify(existing.last_notified_at) and not acked:
                if await send_notification(
                    settings,
                    title=alert.title,
                    message=alert.message,
                    severity=alert.severity,
                    alert_id=alert.id,
                    detail=alert.detail,
                ):
                    existing.last_notified_at = now
            # Resolve duplicate active rows for the same alert (legacy bug)
            for dup in active_for_id[1:]:
                dup.active = False
                dup.resolved_at = now
        else:
            prior = await db.execute(
                select(HealthEvent)
                .where(HealthEvent.alert_id == alert.id)
                .order_by(HealthEvent.last_seen.desc())
                .limit(1)
            )
            prior_ev = prior.scalar_one_or_none()
            if prior_ev and not prior_ev.active:
                prior_ev.active = True
                prior_ev.resolved_at = None
                prior_ev.last_seen = now
                prior_ev.severity = alert.severity
                prior_ev.title = alert.title
                prior_ev.message = alert.message
                prior_ev.detail = alert.detail or ""
                open_events.append(prior_ev)
                acked = prior_ev.acknowledged_at is not None
                if should_notify(prior_ev.last_notified_at) and not acked:
                    if await send_notification(
                        settings,
                        title=alert.title,
                        message=alert.message,
                        severity=alert.severity,
                        alert_id=alert.id,
                        detail=alert.detail,
                    ):
                        prior_ev.last_notified_at = now
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
                open_events.append(ev)
                if await send_notification(
                    settings,
                    title=alert.title,
                    message=alert.message,
                    severity=alert.severity,
                    alert_id=alert.id,
                    detail=alert.detail,
                ):
                    ev.last_notified_at = now

    for ev in open_events:
        if ev.alert_id not in active_ids and ev.active:
            ev.active = False
            ev.resolved_at = now

    await db.commit()
    return report


async def maybe_run_health_persistence(db: AsyncSession) -> None:
    """Run health persistence periodically from the collector (resolves cleared alerts)."""
    last_raw = await get_setting(db, "health_last_persist", "")
    now = datetime.now(UTC)
    if last_raw.strip():
        try:
            last = datetime.fromisoformat(last_raw.replace("Z", "+00:00"))
            if last.tzinfo is None:
                last = last.replace(tzinfo=UTC)
            if (now - last.astimezone(UTC)).total_seconds() < HEALTH_PERSIST_INTERVAL_SECONDS:
                return
        except ValueError:
            pass
    await run_health_with_persistence(db)
    await set_setting(db, "health_last_persist", now.isoformat())
    await db.commit()
