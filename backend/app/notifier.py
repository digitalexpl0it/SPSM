"""Outbound notifications (webhook, ntfy, SMTP email)."""

from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from html import escape
from typing import Any

import httpx

from app.config import settings as app_settings
from app.settings_store import site_timezone_from_settings
from app.timezone_util import resolve_timezone

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


def smtp_ready_for_reports(settings: dict[str, str]) -> bool:
    """Monthly report emails require SMTP host, from, and recipients."""
    return smtp_configured(settings)


def _smtp_recipients(settings: dict[str, str]) -> list[str]:
    raw = (settings.get("notify_smtp_to") or "").strip()
    if not raw:
        return []
    return [a.strip() for a in raw.replace(";", ",").split(",") if a.strip()]


def _timestamps_line(settings: dict[str, str]) -> str:
    now = datetime.now(UTC)
    utc = now.strftime("%Y-%m-%d %H:%M:%S UTC")
    try:
        local = now.astimezone(resolve_timezone(site_timezone_from_settings(settings)))
        local_s = local.strftime("%Y-%m-%d %H:%M:%S %Z")
        return f"{utc} ({local_s})"
    except Exception:
        return utc


def _site_label(settings: dict[str, str]) -> str:
    name = (settings.get("site_name") or "").strip()
    return name or "Your solar site"


def _email_subject(
    title: str,
    severity: str,
    *,
    is_test: bool,
    settings: dict[str, str],
) -> str:
    site = _site_label(settings)
    if is_test:
        return f"SPSM test · Alert preview (Warning & Critical) — {site}"
    label = severity.capitalize()
    return f"[SPSM {label}] {title} — {site}"


def _channel_summary_lines(settings: dict[str, str]) -> list[str]:
    lines: list[str] = []
    if _channel_enabled(settings, "notify_webhook_enabled") and (
        settings.get("notify_webhook_url") or ""
    ).strip():
        lines.append("Webhook (Discord/Slack, etc.)")
    if _channel_enabled(settings, "notify_ntfy_enabled") and (
        settings.get("notify_ntfy_topic") or ""
    ).strip():
        topic = (settings.get("notify_ntfy_topic") or "").strip()
        lines.append(f"ntfy ({topic})")
    if _channel_enabled(settings, "notify_smtp_enabled") and smtp_configured(settings):
        host = (settings.get("notify_smtp_host") or "").strip()
        lines.append(f"SMTP email via {host}")
    return lines


def _portal_base_url(settings: dict[str, str]) -> str | None:
    """URL users open in the browser — not localhost unless you actually use it."""
    for candidate in (
        (settings.get("portal_public_url") or "").strip(),
        (app_settings.portal_public_url or "").strip(),
    ):
        if candidate and "://" in candidate:
            return candidate.rstrip("/")
    for origin in app_settings.cors_origin_list:
        if origin.strip():
            return origin.strip().rstrip("/")
    return None


def _portal_health_url(settings: dict[str, str]) -> str | None:
    base = _portal_base_url(settings)
    return f"{base}/health" if base else None


def _portal_reports_url(settings: dict[str, str]) -> str | None:
    base = _portal_base_url(settings)
    return f"{base}/reports" if base else None


def _pct_change_label(current: float, prior: float) -> str:
    if prior <= 0.01:
        return "—"
    pct = ((current - prior) / prior) * 100
    return f"{pct:+.0f}% vs prior month"


def _metric_row_html(label: str, value: str, sub: str = "") -> str:
    sub_html = (
        f'<div style="font-size:12px;color:#64748b;margin-top:2px;">{escape(sub)}</div>'
        if sub
        else ""
    )
    return f"""
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:14px;">{escape(label)}</td>
        <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;text-align:right;color:#0f172a;font-size:16px;font-weight:600;">{escape(value)}{sub_html}</td>
      </tr>"""


def _build_monthly_report_bodies(
    settings: dict[str, str],
    payload: dict[str, Any],
) -> tuple[str, str, str]:
    """Return (subject, plain, html)."""
    site = _site_label(settings)
    month_label = str(payload["month_label"])
    totals = payload["current"]["totals"]
    period = payload["current"]["period"]
    days_with = payload["current"]["days_with_data"]
    days_in = payload["current"]["days_in_period"]
    prior = payload.get("prior_month") or {}
    prior_totals = prior.get("totals") or {}
    prior_available = prior.get("available", False)
    prior_label = str(prior.get("month_label") or "prior month")
    reports_url = _portal_reports_url(settings)

    subject = f"SPSM · {month_label} solar report — {site}"

    plain_lines = [
        f"SPSM Solar Portal — Monthly energy report",
        f"",
        f"{month_label} ({period['start']} to {period['end']})",
        f"Site: {site}",
        f"",
        f"Solar produced: {totals['pv_kwh']} kWh",
        f"Home load: {totals['load_kwh']} kWh",
        f"Grid import: {totals['import_kwh']} kWh",
        f"Grid export: {totals['export_kwh']} kWh",
        f"Est. CO₂ offset: {totals['co2_kg']} kg",
        f"",
        f"Data coverage: {days_with} of {days_in} days",
    ]
    if prior_available:
        plain_lines.extend(
            [
                "",
                f"Compared to {prior_label}:",
                f"  Solar: {_pct_change_label(totals['pv_kwh'], prior_totals.get('pv_kwh', 0))}",
                f"  Load: {_pct_change_label(totals['load_kwh'], prior_totals.get('load_kwh', 0))}",
            ]
        )
    if reports_url:
        plain_lines.extend(["", f"Full reports: {reports_url}"])
    plain_lines.extend(["", "— SPSM (self-hosted SunPower monitoring)"])
    plain = "\n".join(plain_lines)

    rows = [
        _metric_row_html("Solar produced", f"{totals['pv_kwh']} kWh"),
        _metric_row_html("Home load", f"{totals['load_kwh']} kWh"),
        _metric_row_html("Grid import", f"{totals['import_kwh']} kWh"),
        _metric_row_html("Grid export", f"{totals['export_kwh']} kWh"),
        _metric_row_html("Est. CO₂ offset", f"{totals['co2_kg']} kg"),
        _metric_row_html("Data coverage", f"{days_with} of {days_in} days"),
    ]
    if prior_available:
        rows[0] = _metric_row_html(
            "Solar produced",
            f"{totals['pv_kwh']} kWh",
            _pct_change_label(totals["pv_kwh"], prior_totals.get("pv_kwh", 0)),
        )
        rows[1] = _metric_row_html(
            "Home load",
            f"{totals['load_kwh']} kWh",
            _pct_change_label(totals["load_kwh"], prior_totals.get("load_kwh", 0)),
        )

    cta_html = ""
    if reports_url:
        cta_html = f"""
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;">
            <tr><td align="center">
              <a href="{escape(reports_url)}" style="display:inline-block;padding:14px 28px;background:#0891b2;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;">View full reports</a>
            </td></tr>
          </table>"""

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#e8eef3;font-family:Segoe UI,system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#e8eef3;padding:28px 12px;">
    <tr><td align="center">
      <p style="margin:0 0 16px;font-size:13px;font-weight:700;letter-spacing:0.08em;color:#0891b2;text-transform:uppercase;">SPSM Solar Portal</p>
      <table width="100%" style="max-width:520px;border-collapse:separate;">
        <tr><td style="background:#0891b2;padding:20px 24px;text-align:center;border-radius:10px 10px 0 0;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.14em;color:#e0f2fe;">MONTHLY ENERGY REPORT</p>
          <h1 style="margin:10px 0 0;font-size:24px;line-height:1.25;color:#ffffff;font-weight:700;">{escape(month_label)}</h1>
          <p style="margin:8px 0 0;font-size:13px;color:#e0f2fe;">{escape(site)} · {escape(period['start'])} – {escape(period['end'])}</p>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;padding:22px 24px 24px;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#475569;">Here is your solar production and usage summary for the previous calendar month.</p>
          <table width="100%" cellpadding="0" cellspacing="0">{"".join(rows)}</table>
          {cta_html}
        </td></tr>
      </table>
      <p style="margin:20px 0 0;font-size:11px;color:#94a3b8;text-align:center;max-width:520px;">
        Sent automatically on the 1st of each month · not affiliated with SunPower
      </p>
    </td></tr>
  </table>
</body>
</html>"""
    return subject, plain, html


async def send_monthly_report_email(settings: dict[str, str], payload: dict[str, Any]) -> bool:
    if not smtp_ready_for_reports(settings):
        return False
    subject, plain, html = _build_monthly_report_bodies(settings, payload)
    return await _send_smtp_email(
        settings,
        subject=subject,
        body_plain=plain,
        body_html=html,
    )


def _severity_styles(severity: str) -> dict[str, str]:
    """Light, email-client-friendly palette (similar to common alert templates)."""
    if severity == "critical":
        return {
            "banner_bg": "#dc2626",
            "banner_text": "#ffffff",
            "banner_label": "CRITICAL ALERT",
            "accent": "#dc2626",
            "urgent_color": "#b91c1c",
            "urgent_line": "Urgent attention required",
            "cta_bg": "#0891b2",
            "cta_text": "#ffffff",
        }
    if severity == "warning":
        return {
            "banner_bg": "#d97706",
            "banner_text": "#ffffff",
            "banner_label": "WARNING",
            "accent": "#d97706",
            "urgent_color": "#b45309",
            "urgent_line": "Attention required",
            "cta_bg": "#0891b2",
            "cta_text": "#ffffff",
        }
    return {
        "banner_bg": "#0891b2",
        "banner_text": "#ffffff",
        "banner_label": "NOTICE",
        "accent": "#0891b2",
        "urgent_color": "#0e7490",
        "urgent_line": "Notice",
        "cta_bg": "#0891b2",
        "cta_text": "#ffffff",
    }


def _render_alert_card_plain(
    *,
    styles: dict[str, str],
    title: str,
    message: str,
    detail: str,
    site: str,
    when: str,
    alert_id: str,
    health_url: str | None,
) -> str:
    lines = [
        f"--- {styles['banner_label']} ---",
        title,
        message,
    ]
    if detail:
        lines.extend(["", "What to check:", detail])
    lines.extend(["", f"Site: {site}", f"Time: {when}", f"Alert: {alert_id}"])
    if health_url:
        lines.append(f"Open: {health_url}")
    return "\n".join(lines)


def _render_alert_card_html(
    *,
    styles: dict[str, str],
    title: str,
    message: str,
    detail: str,
    site: str,
    when: str,
    alert_id: str,
    health_url: str | None,
    margin_bottom: str = "24px",
) -> str:
    detail_html = ""
    if detail:
        detail_html = f"""
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid {styles["accent"]};border-radius:8px;margin:0 0 20px;">
                <tr><td style="padding:14px 16px;">
                  <p style="margin:0 0 6px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">What to check</p>
                  <p style="margin:0;font-size:14px;line-height:1.55;color:#334155;">{escape(detail)}</p>
                </td></tr>
              </table>"""

    cta_html = ""
    if health_url:
        cta_html = f"""
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
                <tr><td align="center">
                  <a href="{escape(health_url)}" style="display:inline-block;padding:14px 28px;background:{styles["cta_bg"]};color:{styles["cta_text"]};font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;">View Health dashboard</a>
                </td></tr>
              </table>"""

    return f"""
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;border-collapse:separate;margin:0 auto {margin_bottom};">
        <tr><td style="background:{styles["banner_bg"]};padding:18px 24px;text-align:center;border-radius:10px 10px 0 0;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.14em;color:{styles["banner_text"]};opacity:0.95;">{styles["banner_label"]}</p>
          <h1 style="margin:10px 0 0;font-size:22px;line-height:1.25;color:{styles["banner_text"]};font-weight:700;">{escape(title)}</h1>
          <p style="margin:8px 0 0;font-size:13px;color:{styles["banner_text"]};opacity:0.92;">{escape(site)} · {escape(when)}</p>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;padding:0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:22px 24px 8px;text-align:center;">
              <p style="margin:0;font-size:15px;font-weight:700;color:{styles["urgent_color"]};">⚠ {styles["urgent_line"]}</p>
            </td></tr>
            <tr><td style="padding:8px 24px 0;font-size:15px;line-height:1.6;color:#334155;">
              <p style="margin:0 0 18px;">{escape(message)}</p>
              {detail_html}
              {cta_html}
              <table width="100%" style="font-size:13px;color:#64748b;border-top:1px solid #f1f5f9;">
                <tr><td style="padding:14px 0 4px;width:64px;vertical-align:top;">Site</td><td style="padding:14px 0 4px;color:#475569;">{escape(site)}</td></tr>
                <tr><td style="padding:4px 0;vertical-align:top;">Time</td><td style="padding:4px 0;color:#475569;">{escape(when)}</td></tr>
                <tr><td style="padding:4px 0 14px;vertical-align:top;">Alert</td><td style="padding:4px 0 14px;font-family:Consolas,monospace;font-size:12px;color:#475569;">{escape(alert_id)}</td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>
      </table>"""


def _test_alert_samples() -> list[tuple[str, str, str, str, str]]:
    """Representative health alerts for preview (not real)."""
    return [
        (
            "warning",
            "production_drop",
            "Production dropped sharply",
            (
                "Solar output in the last 15 minutes is much lower than ~45 minutes ago "
                "(about 65% drop). This can happen with passing clouds or a panel issue."
            ),
            (
                "Open the Inverters page and compare panel output. Check weather and shading. "
                "If one inverter is near 0 kW while others produce, inspect that unit on the roof."
            ),
        ),
        (
            "critical",
            "pvs_unreachable",
            "PVS not reachable",
            (
                "The portal cannot log in to your PVS6 right now. Collector data may stop "
                "updating until the connection is restored."
            ),
            (
                "Confirm the PVS IP and serial in Settings, then run Test connection. "
                "Verify the PVS is online on your LAN (router DHCP list, HTTPS on port 443)."
            ),
        ),
    ]


def _build_test_preview_bodies(settings: dict[str, str]) -> tuple[str, str]:
    site = _site_label(settings)
    when = _timestamps_line(settings)
    tz = site_timezone_from_settings(settings)
    min_sev = (settings.get("notify_min_severity") or "critical").capitalize()
    channels = _channel_summary_lines(settings)
    channel_plain = "\n".join(f"  • {c}" for c in channels) if channels else "  • (none)"
    pvs_host = (settings.get("pvs_host") or "").strip() or "Not configured"
    health_url = _portal_health_url(settings)

    plain_parts = [
        "SPSM Solar Portal — TEST (alert preview)",
        "",
        "This email shows sample Warning and Critical layouts. Real alerts use the same template.",
        "",
    ]
    html_cards: list[str] = []
    samples = _test_alert_samples()
    for i, (sev, alert_id, title, message, detail) in enumerate(samples):
        styles = _severity_styles(sev)
        plain_parts.append(
            _render_alert_card_plain(
                styles=styles,
                title=title,
                message=message,
                detail=detail,
                site=site,
                when=when,
                alert_id=f"sample.{alert_id}",
                health_url=health_url,
            )
        )
        plain_parts.append("")
        mb = "16px" if i < len(samples) - 1 else "20px"
        html_cards.append(
            _render_alert_card_html(
                styles=styles,
                title=title,
                message=message,
                detail=detail,
                site=site,
                when=when,
                alert_id=f"sample.{alert_id}",
                health_url=health_url,
                margin_bottom=mb,
            )
        )

    plain_parts.extend(
        [
            "Your notification setup:",
            f"  Site: {site}",
            f"  Time sent: {when}",
            f"  Timezone: {tz}",
            f"  PVS host: {pvs_host}",
            f"  Minimum severity for real alerts: {min_sev}",
            "  Active channels:",
            channel_plain,
            "",
            "Test messages always send (even if minimum is Critical only).",
            "",
            "— SPSM (self-hosted SunPower monitoring)",
        ]
    )
    ch_items = (
        "".join(f'<li style="margin:4px 0;">{escape(c)}</li>' for c in channels)
        or "<li>(none)</li>"
    )
    cards_html = "".join(html_cards)
    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#e8eef3;font-family:Segoe UI,system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#e8eef3;padding:28px 12px;">
    <tr><td align="center">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;color:#0891b2;text-transform:uppercase;">SPSM Solar Portal</p>
      <table width="100%" style="max-width:520px;margin:0 auto 20px;background:#475569;border-radius:10px;">
        <tr><td style="padding:14px 20px;text-align:center;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.1em;color:#f8fafc;">TEST — NOT A REAL ALERT</p>
          <p style="margin:6px 0 0;font-size:14px;color:#e2e8f0;line-height:1.45;">Preview of Warning &amp; Critical emails below. Delivery is working.</p>
        </td></tr>
      </table>
      {cards_html}
      <table width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;">
        <tr><td style="padding:18px 22px;font-size:13px;line-height:1.55;color:#475569;">
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Your setup</p>
          <p style="margin:0 0 6px;"><strong>Site:</strong> {escape(site)}</p>
          <p style="margin:0 0 6px;"><strong>PVS host:</strong> <span style="font-family:monospace;">{escape(pvs_host)}</span></p>
          <p style="margin:0 0 6px;"><strong>Minimum severity:</strong> {escape(min_sev)}</p>
          <p style="margin:0 0 6px;"><strong>Active channels:</strong></p>
          <ul style="margin:0 0 0 18px;padding:0;">{ch_items}</ul>
        </td></tr>
      </table>
      <p style="margin:20px 0 0;font-size:11px;color:#94a3b8;text-align:center;max-width:520px;">
        Self-hosted SunPower PVS monitoring · not affiliated with SunPower
      </p>
    </td></tr>
  </table>
</body>
</html>"""
    return "\n".join(plain_parts), html


def _build_smtp_bodies(
    settings: dict[str, str],
    *,
    title: str,
    message: str,
    severity: str,
    is_test: bool,
    alert_id: str | None,
    detail: str | None = None,
) -> tuple[str, str]:
    """Return (plain_text, html) email bodies."""
    if is_test:
        return _build_test_preview_bodies(settings)

    site = _site_label(settings)
    when = _timestamps_line(settings)
    styles = _severity_styles(severity)
    detail_text = (detail or "").strip()
    health_url = _portal_health_url(settings)
    aid = alert_id or "—"

    plain = _render_alert_card_plain(
        styles=styles,
        title=title,
        message=message,
        detail=detail_text,
        site=site,
        when=when,
        alert_id=aid,
        health_url=health_url,
    )
    plain = f"SPSM Solar Portal\n\n{plain}\n\n— SPSM (self-hosted SunPower monitoring)"

    card = _render_alert_card_html(
        styles=styles,
        title=title,
        message=message,
        detail=detail_text,
        site=site,
        when=when,
        alert_id=aid,
        health_url=health_url,
        margin_bottom="0",
    )
    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#e8eef3;font-family:Segoe UI,system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#e8eef3;padding:28px 12px;">
    <tr><td align="center">
      <p style="margin:0 0 16px;font-size:13px;font-weight:700;letter-spacing:0.08em;color:#0891b2;text-transform:uppercase;">SPSM Solar Portal</p>
      {card}
      <p style="margin:20px 0 0;font-size:11px;color:#94a3b8;text-align:center;max-width:520px;">
        Automated alert from your self-hosted SunPower monitor. Not affiliated with SunPower.
      </p>
    </td></tr>
  </table>
</body>
</html>"""
    return plain, html


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
    body_plain: str,
    body_html: str | None = None,
) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = ", ".join(to_addrs)
    msg.set_content(body_plain)
    if body_html:
        msg.add_alternative(body_html, subtype="html")

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
    body_plain: str,
    body_html: str | None = None,
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
            body_plain=body_plain,
            body_html=body_html,
        )
        return True
    except (OSError, smtplib.SMTPException) as e:
        logger.warning("SMTP notify failed: %s", e)
        return False


def _active_channels(settings: dict[str, str]) -> list[str]:
    """Channels that are enabled and have required fields filled."""
    channels: list[str] = []
    if _channel_enabled(settings, "notify_webhook_enabled") and (
        settings.get("notify_webhook_url") or ""
    ).strip():
        channels.append("webhook")
    if _channel_enabled(settings, "notify_ntfy_enabled") and (
        settings.get("notify_ntfy_topic") or ""
    ).strip():
        channels.append("ntfy")
    if _channel_enabled(settings, "notify_smtp_enabled") and smtp_configured(settings):
        channels.append("smtp")
    return channels


def explain_notification_block(settings: dict[str, str], *, is_test: bool = False) -> str | None:
    """Human-readable reason notifications would not send, or None if they may send."""
    if settings.get("notify_enabled", "false").lower() != "true":
        return "Turn on Enable notifications (master switch)."
    channels = _active_channels(settings)
    if not channels:
        return (
            "Enable at least one channel (webhook, ntfy, or SMTP) and fill its required fields, "
            "then Save settings."
        )
    if is_test:
        return None
    return None


async def send_notification(
    settings: dict[str, str],
    *,
    title: str,
    message: str,
    severity: str = "info",
    alert_id: str | None = None,
    detail: str | None = None,
    is_test: bool = False,
) -> bool:
    if settings.get("notify_enabled", "false").lower() != "true":
        return False
    minimum = settings.get("notify_min_severity", "critical")
    if not is_test and not _meets_min_severity(severity, minimum):
        return False
    if is_test and not _active_channels(settings):
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
    smtp_subject = _email_subject(
        title, severity, is_test=is_test, settings=settings
    )
    body_plain, body_html = _build_smtp_bodies(
        settings,
        title=title,
        message=message,
        severity=severity,
        is_test=is_test,
        alert_id=alert_id,
        detail=detail,
    )

    if _channel_enabled(settings, "notify_smtp_enabled") and smtp_configured(settings):
        if await _send_smtp_email(
            settings,
            subject=smtp_subject,
            body_plain=body_plain,
            body_html=body_html,
        ):
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
