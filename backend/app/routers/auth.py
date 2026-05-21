from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.database import get_db
from app.models import User
from app.settings_store import is_setup_complete

router = APIRouter(prefix="/api/auth", tags=["auth"])


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    setup_required: bool


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)


class UserResponse(BaseModel):
    username: str
    is_admin: bool


@router.post("/login", response_model=TokenResponse)
async def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(User).where(User.username == form.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    setup_required = not await is_setup_complete(db)
    return TokenResponse(
        access_token=create_access_token(user.username),
        setup_required=setup_required,
    )


@router.post("/register", response_model=TokenResponse)
async def register(body: RegisterRequest, db: Annotated[AsyncSession, Depends(get_db)]):
    from sqlalchemy import func
    count = await db.scalar(select(func.count()).select_from(User))
    if count and count > 0:
        raise HTTPException(status_code=400, detail="Registration closed — user already exists")
    user = User(username=body.username, password_hash=hash_password(body.password), is_admin=True)
    db.add(user)
    await db.flush()
    await db.commit()
    return TokenResponse(
        access_token=create_access_token(user.username),
        setup_required=True,
    )


@router.get("/me", response_model=UserResponse)
async def me(user: Annotated[User, Depends(get_current_user)]):
    return UserResponse(username=user.username, is_admin=user.is_admin)


@router.get("/status")
async def auth_status(db: Annotated[AsyncSession, Depends(get_db)]):
    result = await db.execute(select(User))
    has_user = result.scalar_one_or_none() is not None
    return {
        "has_user": has_user,
        "setup_complete": await is_setup_complete(db),
    }
