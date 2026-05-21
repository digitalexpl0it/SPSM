from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import ensure_default_admin
from app.config import settings
from app.database import Base, engine, async_session
from app.routers import auth, data, settings as settings_router, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_session() as db:
        await ensure_default_admin(db)
    yield


app = FastAPI(title="SPSM Solar Portal", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(settings_router.router)
app.include_router(data.router)
app.include_router(users.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
