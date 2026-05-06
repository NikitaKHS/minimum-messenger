import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.devices.models import Device


class DeviceRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_by_id(self, device_id: uuid.UUID) -> Device | None:
        return await self._db.scalar(select(Device).where(Device.id == device_id))

    async def get_by_fingerprint(self, user_id: uuid.UUID, fingerprint: str) -> Device | None:
        return await self._db.scalar(
            select(Device).where(
                Device.user_id == user_id,
                Device.public_key_fingerprint == fingerprint,
                Device.is_active == True,  # noqa: E712
            )
        )

    async def list_active(self, user_id: uuid.UUID) -> list[Device]:
        result = await self._db.scalars(
            select(Device).where(Device.user_id == user_id, Device.is_active == True)  # noqa: E712
        )
        return list(result)

    async def list_by_user(self, user_id: uuid.UUID) -> list[Device]:
        result = await self._db.scalars(select(Device).where(Device.user_id == user_id))
        return list(result)

    async def revoke(self, device: Device) -> None:
        device.is_active = False
        device.revoked_at = datetime.now(timezone.utc)
        await self._db.flush()

    async def touch(self, device: Device) -> None:
        device.last_seen_at = datetime.now(timezone.utc)
        await self._db.flush()
