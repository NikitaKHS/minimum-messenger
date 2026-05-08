import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.users.models import User


class UserRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_latest_device_fingerprint(self, user_id: uuid.UUID) -> str | None:
        from app.modules.devices.models import Device  # noqa: PLC0415
        return await self._db.scalar(
            select(Device.public_key_fingerprint)
            .where(Device.user_id == user_id, Device.is_active.is_(True))
            .order_by(Device.created_at.desc())
            .limit(1)
        )

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        return await self._db.scalar(
            select(User).where(User.id == user_id, User.deleted_at.is_(None))
        )

    async def get_by_username(self, username: str) -> User | None:
        return await self._db.scalar(
            select(User).where(User.username == username, User.deleted_at.is_(None))
        )

    async def get_by_email(self, email: str) -> User | None:
        return await self._db.scalar(
            select(User).where(User.email == email, User.deleted_at.is_(None))
        )

    async def search(self, current_user_id: uuid.UUID, query: str, limit: int = 20) -> list[User]:
        result = await self._db.scalars(
            select(User)
            .where(
                User.username.ilike(f"%{query}%"),
                User.deleted_at.is_(None),
                User.id != current_user_id,
            )
            .limit(limit)
        )
        return list(result)
