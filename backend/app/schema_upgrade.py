"""Idempotent patches for existing PostgreSQL databases.

SQLAlchemy create_all() creates new tables but does not ALTER existing ones.
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

# Safe to re-run on every startup.
_SCHEMA_PATCHES = (
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_readonly BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE health_events ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ",
    "ALTER TABLE health_events ADD COLUMN IF NOT EXISTS acknowledged_by INTEGER",
)


async def run_schema_upgrades(conn: AsyncConnection) -> None:
    for stmt in _SCHEMA_PATCHES:
        await conn.execute(text(stmt))
