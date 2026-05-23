from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, hash_password, require_admin, require_write_access, verify_password
from app.database import get_db
from app.models import User

router = APIRouter(prefix="/api/users", tags=["users"])


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=128)


class CreateUserRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    is_admin: bool = False
    is_readonly: bool = False


class UserListItem(BaseModel):
    id: int
    username: str
    is_admin: bool
    is_readonly: bool


class UpdateUserRequest(BaseModel):
    username: str | None = Field(None, min_length=3, max_length=64)
    password: str | None = Field(None, min_length=6, max_length=128)
    is_admin: bool | None = None
    is_readonly: bool | None = None


@router.get("", response_model=list[UserListItem])
async def list_users(
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(User).order_by(User.username))
    return [
        UserListItem(
            id=u.id, username=u.username, is_admin=u.is_admin, is_readonly=u.is_readonly
        )
        for u in result.scalars()
    ]


@router.post("", response_model=UserListItem, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: CreateUserRequest,
    _: Annotated[User, Depends(require_admin)],
    __: Annotated[User, Depends(require_write_access)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already exists")
    new_user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        is_admin=body.is_admin,
        is_readonly=body.is_readonly,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return UserListItem(
        id=new_user.id,
        username=new_user.username,
        is_admin=new_user.is_admin,
        is_readonly=new_user.is_readonly,
    )


async def _admin_count(db: AsyncSession) -> int:
    result = await db.execute(select(func.count()).select_from(User).where(User.is_admin.is_(True)))
    return int(result.scalar_one())


@router.patch("/{user_id}", response_model=UserListItem)
async def update_user(
    user_id: int,
    body: UpdateUserRequest,
    _: Annotated[User, Depends(require_admin)],
    __: Annotated[User, Depends(require_write_access)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if body.username is not None and body.username != target.username:
        taken = await db.execute(select(User).where(User.username == body.username))
        if taken.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Username already exists")
        target.username = body.username

    if body.password:
        target.password_hash = hash_password(body.password)

    if body.is_admin is not None:
        if target.is_admin and not body.is_admin:
            if await _admin_count(db) <= 1:
                raise HTTPException(status_code=400, detail="Cannot remove the only admin")
        target.is_admin = body.is_admin

    if body.is_readonly is not None:
        target.is_readonly = body.is_readonly

    await db.commit()
    await db.refresh(target)
    return UserListItem(
        id=target.id,
        username=target.username,
        is_admin=target.is_admin,
        is_readonly=target.is_readonly,
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    current: Annotated[User, Depends(require_admin)],
    _: Annotated[User, Depends(require_write_access)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if current.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.is_admin and await _admin_count(db) <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the only admin")
    await db.delete(target)
    await db.commit()


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    user: Annotated[User, Depends(require_write_access)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"ok": True, "message": "Password updated"}
