"""
Admin API — no access to plaintext messages.
Protected by admin secret key header.
"""
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ForbiddenError
from app.db.session import get_db
from app.modules.audit.models import AuditLog
from app.modules.devices.models import Device
from app.modules.users.models import User
from app.modules.users.schemas import UserOut

router = APIRouter(prefix="/admin", tags=["admin"])


def _require_admin(x_admin_key: Annotated[str, Header()] = "") -> None:
    if x_admin_key != settings.ADMIN_SECRET_KEY:
        raise ForbiddenError("Invalid admin key")


@router.get("/users", response_model=list[UserOut], dependencies=[Depends(_require_admin)])
async def list_users(
    db: AsyncSession = Depends(get_db),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[UserOut]:
    result = await db.scalars(
        select(User).where(User.deleted_at.is_(None)).offset(offset).limit(limit)
    )
    return [UserOut.model_validate(u) for u in result]


@router.get("/users/{user_id}", response_model=UserOut, dependencies=[Depends(_require_admin)])
async def get_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> UserOut:
    user = await db.get(User, user_id)
    if not user:
        from app.core.exceptions import NotFoundError
        raise NotFoundError()
    return UserOut.model_validate(user)


@router.post("/users/{user_id}/ban", status_code=204, dependencies=[Depends(_require_admin)])
async def ban_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> None:
    user = await db.get(User, user_id)
    if not user:
        from app.core.exceptions import NotFoundError
        raise NotFoundError()
    user.status = "banned"
    await db.flush()


@router.get("/audit", dependencies=[Depends(_require_admin)])
async def get_audit_log(
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[dict]:
    q = select(AuditLog).order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)
    if user_id:
        q = q.where(AuditLog.user_id == user_id)
    rows = await db.scalars(q)
    return [
        {
            "id": str(r.id),
            "user_id": str(r.user_id) if r.user_id else None,
            "device_id": str(r.device_id) if r.device_id else None,
            "event_type": r.event_type,
            "ip": str(r.ip) if r.ip else None,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.get("/system/health", dependencies=[Depends(_require_admin)])
async def system_health(db: AsyncSession = Depends(get_db)) -> dict:
    user_count = await db.scalar(select(func.count(User.id)).select_from(User).where(User.deleted_at.is_(None)))
    device_count = await db.scalar(select(func.count(Device.id)).select_from(Device).where(Device.is_active == True))  # noqa: E712
    return {
        "status": "ok",
        "users": user_count,
        "active_devices": device_count,
    }
