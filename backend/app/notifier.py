"""Outbound notifications (webhook + ntfy)."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

logger = logging.getLogger(__name__)

NOTIFY_DEBOUNCE_HOURS = 6
SEVERITY_RANK = {"info": 0, "warning": 1, "critical": 2}


def _meets_min_severity(severity: str, minimum: str) -> bool:
    return SEVERITY_RANK.get(severity, 0) >= SEVERITY_RANK.get(minimum, 2)


def should_notify(
    last_notified_at: datetime | None,
    debounce_hours: int = NOTIFY_DEBOUNCE_HOURS,
) -> bool:
    if last_notified_at is None:
        return True
    if last_notified_at.tzinfo is None:
        last_notified_at = last_notified_at.replace(tzinfo=UTC)
    return datetime.now(UTC) - last_notified_at >= timedelta(hours=debounce_hours)


async def send_notification(
    settings: dict[str, str],
    *,
    title: str,
    message: str,
    severity: str = "info",
    alert_id: str | None = None,
) -> bool:
    if settings.get("notify_enabled", "false").lower() != "true":
        return False
    minimum = settings.get("notify_min_severity", "critical")
    if not _meets_min_severity(severity, minimum):
        return False

    payload: dict[str, Any] = {
        "title": f"SPSM: {title}",
        "message": message,
        "severity": severity,
        "alert_id": alert_id,
        "source": "spsm",
    }

    sent = False
    webhook = (settings.get("notify_webhook_url") or "").strip()
    ntfy = (settings.get("notify_ntfy_topic") or "").strip()

    async with httpx.AsyncClient(timeout=15.0) as client:
        if webhook:
            try:
                r = await client.post(
                    webhook,
                    json={
                        "content": f"**{payload['title']}**\n{message}",
                        **payload,
                    },
                )
                r.raise_for_status()
                sent = True
            except httpx.HTTPError as e:
                logger.warning("Webhook notify failed: %s", e)

        if ntfy:
            topic = ntfy.lstrip("/")
            url = f"https://ntfy.sh/{topic}" if not ntfy.startswith("http") else ntfy
            try:
                r = await client.post(
                    url,
                    data=message.encode(),
                    headers={
                        "Title": payload["title"],
                        "Priority": "urgent" if severity == "critical" else "default",
                        "Tags": "solar,spsm",
                    },
                )
                r.raise_for_status()
                sent = True
            except httpx.HTTPError as e:
                logger.warning("ntfy notify failed: %s", e)

    return sent
