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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


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
