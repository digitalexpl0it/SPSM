from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import generate_api_token, require_admin
from app.database import get_db
from app.models import ApiToken, User

router = APIRouter(prefix="/api/tokens", tags=["tokens"])


class CreateTokenRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    expires_in_days: int | None = Field(None, ge=1, le=3650)


class TokenListItem(BaseModel):
    id: int
    name: str
    token_prefix: str
    user_id: int
    created_at: str
    last_used_at: str | None
    expires_at: str | None


class CreateTokenResponse(TokenListItem):
    token: str


def _token_item(row: ApiToken) -> TokenListItem:
    return TokenListItem(
        id=row.id,
        name=row.name,
        token_prefix=row.token_prefix,
        user_id=row.user_id,
        created_at=row.created_at.isoformat(),
        last_used_at=row.last_used_at.isoformat() if row.last_used_at else None,
        expires_at=row.expires_at.isoformat() if row.expires_at else None,
    )


@router.get("", response_model=list[TokenListItem])
async def list_tokens(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(ApiToken).order_by(ApiToken.created_at.desc()))
    return [_token_item(r) for r in result.scalars()]


@router.post("", response_model=CreateTokenResponse, status_code=status.HTTP_201_CREATED)
async def create_token(
    body: CreateTokenRequest,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    full, prefix, token_hash = generate_api_token()
    expires_at = None
    if body.expires_in_days is not None:
        expires_at = datetime.now(UTC) + timedelta(days=body.expires_in_days)
    row = ApiToken(
        name=body.name.strip(),
        token_prefix=prefix,
        token_hash=token_hash,
        user_id=admin.id,
        expires_at=expires_at,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    item = _token_item(row)
    return CreateTokenResponse(**item.model_dump(), token=full)


@router.delete("/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_token(
    token_id: int,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    row = await db.get(ApiToken, token_id)
    if not row:
        raise HTTPException(status_code=404, detail="Token not found")
    await db.delete(row)
    await db.commit()
