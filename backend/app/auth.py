import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import ApiToken, User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False, scheme_name="Bearer")

ALGORITHM = "HS256"
API_TOKEN_PREFIX = "spsm_"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(subject: str) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode(
        {"sub": subject, "exp": expire},
        settings.secret_key,
        algorithm=ALGORITHM,
    )


def hash_api_token(token: str) -> str:
    material = f"{settings.secret_key}:{token}"
    return hashlib.sha256(material.encode()).hexdigest()


def generate_api_token() -> tuple[str, str, str]:
    """Return (full_token, token_prefix, token_hash)."""
    secret = secrets.token_urlsafe(32)
    full = f"{API_TOKEN_PREFIX}{secret}"
    prefix = full[: len(API_TOKEN_PREFIX) + 8]
    return full, prefix, hash_api_token(full)


async def _user_from_api_token(token: str, db: AsyncSession) -> User | None:
    if not token.startswith(API_TOKEN_PREFIX):
        return None
    token_hash = hash_api_token(token)
    result = await db.execute(select(ApiToken).where(ApiToken.token_hash == token_hash))
    row = result.scalar_one_or_none()
    if row is None:
        return None
    now = datetime.now(UTC)
    if row.expires_at is not None:
        exp = row.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=UTC)
        if now >= exp.astimezone(UTC):
            return None
    user = await db.get(User, row.user_id)
    if user is None:
        return None
    row.last_used_at = now
    return user


async def _user_from_jwt(token: str, db: AsyncSession) -> User | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        username: str | None = payload.get("sub")
        if username is None:
            return None
    except JWTError:
        return None
    result = await db.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def get_current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if creds is None or not creds.credentials:
        raise credentials_exception

    token = creds.credentials.strip()
    if token.startswith(API_TOKEN_PREFIX):
        user = await _user_from_api_token(token, db)
    else:
        user = await _user_from_jwt(token, db)

    if user is None:
        raise credentials_exception
    return user


async def require_admin(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user


async def require_write_access(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    if user.is_readonly:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Read-only access",
        )
    return user


async def ensure_default_admin(db: AsyncSession) -> None:
    result = await db.execute(select(User))
    if result.scalar_one_or_none() is not None:
        return
    db.add(
        User(
            username="admin",
            password_hash=hash_password("admin"),
            is_admin=True,
            is_readonly=False,
        )
    )
    await db.commit()
