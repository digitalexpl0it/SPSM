from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=True)
    is_readonly: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ApiToken(Base):
    __tablename__ = "api_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128))
    token_prefix: Mapped[str] = mapped_column(String(16), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Reading(Base):
    """Time-series snapshot from PVS livedata + rolled-up totals."""

    __tablename__ = "readings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    pv_kw: Mapped[float | None] = mapped_column(Float)
    net_kw: Mapped[float | None] = mapped_column(Float)
    load_kw: Mapped[float | None] = mapped_column(Float)
    battery_kw: Mapped[float | None] = mapped_column(Float)
    battery_soc: Mapped[float | None] = mapped_column(Float)

    pv_kwh_total: Mapped[float | None] = mapped_column(Float)
    net_kwh_total: Mapped[float | None] = mapped_column(Float)
    load_kwh_total: Mapped[float | None] = mapped_column(Float)
    battery_kwh_total: Mapped[float | None] = mapped_column(Float)

    backup_minutes: Mapped[int | None] = mapped_column(Integer)
    mid_state: Mapped[int | None] = mapped_column(Integer)


class DeviceSnapshot(Base):
    """Raw JSON blobs for inverters, meters, ESS — full varserver pull."""

    __tablename__ = "device_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    category: Mapped[str] = mapped_column(String(32), index=True)  # inverter, meter, ess, system
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)


class ReadingRollup(Base):
    """Pre-aggregated buckets for fast long-range charts."""

    __tablename__ = "reading_rollups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bucket_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    bucket: Mapped[str] = mapped_column(String(8), index=True)  # hour | day

    pv_kw_avg: Mapped[float | None] = mapped_column(Float)
    net_kw_avg: Mapped[float | None] = mapped_column(Float)
    load_kw_avg: Mapped[float | None] = mapped_column(Float)
    battery_kw_avg: Mapped[float | None] = mapped_column(Float)
    battery_soc_avg: Mapped[float | None] = mapped_column(Float)

    pv_kwh_total_end: Mapped[float | None] = mapped_column(Float)
    net_kwh_total_end: Mapped[float | None] = mapped_column(Float)
    load_kwh_total_end: Mapped[float | None] = mapped_column(Float)
    sample_count: Mapped[int] = mapped_column(Integer, default=0)


class HealthEvent(Base):
    """Persisted health alert transitions."""

    __tablename__ = "health_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    alert_id: Mapped[str] = mapped_column(String(64), index=True)
    severity: Mapped[str] = mapped_column(String(16))
    title: Mapped[str] = mapped_column(String(128))
    message: Mapped[str] = mapped_column(Text, default="")
    detail: Mapped[str] = mapped_column(Text, default="")
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    last_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
