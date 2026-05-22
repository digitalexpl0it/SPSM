"""Prometheus metrics endpoint."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Response
from sqlalchemy import func, select

from app.database import async_session
from app.health_checks import evaluate_site_health
from app.models import HealthEvent, Reading
from app.settings_store import get_all_settings

router = APIRouter(tags=["metrics"])


@router.get("/metrics")
async def prometheus_metrics():
    async with async_session() as db:
        settings = await get_all_settings(db)
        report = await evaluate_site_health(db, settings)

        latest = await db.execute(select(Reading).order_by(Reading.ts.desc()).limit(1))
        row = latest.scalar_one_or_none()
        age = -1.0
        if row:
            ts = row.ts if row.ts.tzinfo else row.ts.replace(tzinfo=UTC)
            age = (datetime.now(UTC) - ts).total_seconds()

        active_alerts = await db.execute(
            select(func.count()).select_from(HealthEvent).where(HealthEvent.active.is_(True))
        )
        alert_count = active_alerts.scalar() or 0

    pvs = 1 if report.get("pvs_connected") else 0
    summary = report.get("summary", "healthy")
    lines = [
        "# HELP spsm_pvs_connected PVS login reachable",
        "# TYPE spsm_pvs_connected gauge",
        f"spsm_pvs_connected {pvs}",
        "# HELP spsm_last_reading_age_seconds Seconds since last collector reading",
        "# TYPE spsm_last_reading_age_seconds gauge",
        f"spsm_last_reading_age_seconds {age:.0f}",
        "# HELP spsm_active_alerts Active health alerts",
        "# TYPE spsm_active_alerts gauge",
        f"spsm_active_alerts {alert_count}",
        "# HELP spsm_health_summary_code 0=healthy 1=info 2=warning 3=critical",
        "# TYPE spsm_health_summary_code gauge",
        f"spsm_health_summary_code {{summary=\"{summary}\"}} "
        f"{['healthy','info','warning','critical'].index(summary) if summary in ('healthy','info','warning','critical') else 0}",
    ]
    return Response(content="\n".join(lines) + "\n", media_type="text/plain; version=0.0.4")
