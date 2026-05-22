"""Outbound notifications (webhook, ntfy, SMTP email)."""

from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
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


def _channel_enabled(settings: dict[str, str], key: str) -> bool:
    return settings.get(key, "false").lower() == "true"


def smtp_configured(settings: dict[str, str]) -> bool:
    host = (settings.get("notify_smtp_host") or "").strip()
    to_addrs = _smtp_recipients(settings)
    from_addr = (settings.get("notify_smtp_from") or "").strip() or (
        settings.get("notify_smtp_username") or ""
    ).strip()
    return bool(host and to_addrs and from_addr)


def _smtp_recipients(settings: dict[str, str]) -> list[str]:
    raw = (settings.get("notify_smtp_to") or "").strip()
    if not raw:
        return []
    return [a.strip() for a in raw.replace(";", ",").split(",") if a.strip()]


def _send_smtp_sync(
    *,
    host: str,
    port: int,
    use_tls: bool,
    username: str,
    password: str,
    from_addr: str,
    to_addrs: list[str],
    subject: str,
    body: str,
) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = ", ".join(to_addrs)
    msg.set_content(body)

    with smtplib.SMTP(host, port, timeout=30) as smtp:
        if use_tls:
            smtp.starttls(context=ssl.create_default_context())
        if username:
            smtp.login(username, password)
        smtp.send_message(msg, from_addr=from_addr, to_addrs=to_addrs)


async def _send_smtp_email(
    settings: dict[str, str],
    *,
    subject: str,
    body: str,
) -> bool:
    if not smtp_configured(settings):
        return False

    host = (settings.get("notify_smtp_host") or "").strip()
    try:
        port = int((settings.get("notify_smtp_port") or "587").strip())
    except ValueError:
        port = 587
    use_tls = (settings.get("notify_smtp_use_tls") or "true").lower() == "true"
    username = (settings.get("notify_smtp_username") or "").strip()
    password = settings.get("notify_smtp_password") or ""
    from_addr = (settings.get("notify_smtp_from") or "").strip() or username
    to_addrs = _smtp_recipients(settings)

    try:
        await asyncio.to_thread(
            _send_smtp_sync,
            host=host,
            port=port,
            use_tls=use_tls,
            username=username,
            password=password,
            from_addr=from_addr,
            to_addrs=to_addrs,
            subject=subject,
            body=body,
        )
        return True
    except (OSError, smtplib.SMTPException) as e:
        logger.warning("SMTP notify failed: %s", e)
        return False


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
    subject = str(payload["title"])
    body = f"{message}\n\nSeverity: {severity}"

    if _channel_enabled(settings, "notify_smtp_enabled") and smtp_configured(settings):
        if await _send_smtp_email(settings, subject=subject, body=body):
            sent = True

    async with httpx.AsyncClient(timeout=15.0) as client:
        if _channel_enabled(settings, "notify_webhook_enabled") and webhook:
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

        if _channel_enabled(settings, "notify_ntfy_enabled") and ntfy:
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
