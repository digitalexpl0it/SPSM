from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import ensure_default_admin
from app.config import settings
from app.database import Base, engine, async_session
from app.routers import (
    auth,
    backup,
    database_admin,
    data,
    health_alerts,
    live_stream,
    metrics,
    reports,
    settings as settings_router,
    users,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_session() as db:
        await ensure_default_admin(db)
    yield


app = FastAPI(title="SPSM Solar Portal", version="0.1.0", lifespan=lifespan)

_cors_kwargs: dict = {
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
if settings.cors_allow_private_networks:
    _cors_kwargs["allow_origin_regex"] = (
        r"https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$"
    )
else:
    _cors_kwargs["allow_origins"] = settings.cors_origin_list

app.add_middleware(CORSMiddleware, **_cors_kwargs)

app.include_router(auth.router)
app.include_router(settings_router.router)
app.include_router(data.router)
app.include_router(users.router)
app.include_router(health_alerts.router)
app.include_router(reports.router)
app.include_router(live_stream.router)
app.include_router(metrics.router)
app.include_router(backup.router)
app.include_router(database_admin.router)


@app.get("/api/health")
async def health_ping():
    return {"status": "ok"}
