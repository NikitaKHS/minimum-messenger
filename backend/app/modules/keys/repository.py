import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.keys.models import OneTimePrekey


class KeyRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def add_prekeys(self, prekeys: list[OneTimePrekey]) -> None:
        for pk in prekeys:
            self._db.add(pk)
        await self._db.flush()

    async def pop_one_time_prekey(self, device_id: uuid.UUID) -> OneTimePrekey | None:
        prekey = await self._db.scalar(
            select(OneTimePrekey).where(
                OneTimePrekey.device_id == device_id,
                OneTimePrekey.is_used == False,  # noqa: E712
            ).limit(1).with_for_update(skip_locked=True)
        )
        if prekey:
            from datetime import datetime, timezone
            prekey.is_used = True
            prekey.used_at = datetime.now(timezone.utc)
            await self._db.flush()
        return prekey

    async def count_available(self, device_id: uuid.UUID) -> int:
        from sqlalchemy import func, select
        result = await self._db.scalar(
            select(func.count()).where(
                OneTimePrekey.device_id == device_id,
                OneTimePrekey.is_used == False,  # noqa: E712
            )
        )
        return result or 0
