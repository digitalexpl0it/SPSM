"""Scheduled monthly energy report email (SMTP only)."""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.notifier import send_monthly_report_email, smtp_ready_for_reports
from app.report_period import (
    build_period_report,
    calendar_month_bounds,
    previous_calendar_month,
)
from app.settings_store import get_all_settings, set_setting
from app.timezone_util import resolve_timezone

logger = logging.getLogger(__name__)


def month_label(year: int, month: int) -> str:
    return datetime(year, month, 1).strftime("%B %Y")


async def build_monthly_report_payload(
    db: AsyncSession,
    settings: dict[str, str],
    year: int,
    month: int,
) -> dict[str, Any]:
    start, end = calendar_month_bounds(year, month)
    current = await build_period_report(db, settings, start, end)

    prior_year, prior_month = previous_calendar_month(date(year, month, 1))
    p_start, p_end = calendar_month_bounds(prior_year, prior_month)
    prior = await build_period_report(db, settings, p_start, p_end)

    return {
        "month_key": f"{year:04d}-{month:02d}",
        "month_label": month_label(year, month),
        "current": current,
        "prior_month": {
            "available": prior["days_with_data"] > 0,
            "month_label": month_label(prior_year, prior_month),
            "totals": prior["totals"],
            "days_with_data": prior["days_with_data"],
            "days_in_period": prior["days_in_period"],
        },
    }


async def maybe_send_monthly_report(db: AsyncSession) -> bool:
    """On the 1st (site local day), email the previous calendar month once."""
    settings = await get_all_settings(db)
    if settings.get("monthly_report_enabled", "false").lower() != "true":
        return False
    if not smtp_ready_for_reports(settings):
        return False

    tz = resolve_timezone(settings.get("site_timezone"))
    local_now = datetime.now(UTC).astimezone(tz)
    if local_now.day != 1:
        return False

    year, month = previous_calendar_month(local_now.date())
    month_key = f"{year:04d}-{month:02d}"
    if (settings.get("monthly_report_last_sent") or "").strip() == month_key:
        return False

    payload = await build_monthly_report_payload(db, settings, year, month)
    if payload["current"]["days_with_data"] < 1:
        logger.info("Monthly report skipped for %s — no collector data", month_key)
        return False

    sent = await send_monthly_report_email(settings, payload)
    if sent:
        await set_setting(db, "monthly_report_last_sent", month_key)
        await db.commit()
        logger.info("Monthly report emailed for %s", month_key)
    return sent


async def send_monthly_report_now(
    db: AsyncSession,
    *,
    year: int | None = None,
    month: int | None = None,
) -> tuple[bool, str]:
    """Manual/test send for the previous calendar month (or explicit month)."""
    settings = await get_all_settings(db)
    if not smtp_ready_for_reports(settings):
        return False, "Configure SMTP host, from, and to addresses before sending reports."

    tz = resolve_timezone(settings.get("site_timezone"))
    local_today = datetime.now(UTC).astimezone(tz).date()
    if year is None or month is None:
        year, month = previous_calendar_month(local_today)

    payload = await build_monthly_report_payload(db, settings, year, month)
    if payload["current"]["days_with_data"] < 1:
        return (
            False,
            f"No collector data for {payload['month_label']}. "
            "Wait until readings exist for that month.",
        )

    if await send_monthly_report_email(settings, payload):
        return True, f"Monthly report sent for {payload['month_label']}."
    return False, "SMTP delivery failed. Check credentials and API logs."
