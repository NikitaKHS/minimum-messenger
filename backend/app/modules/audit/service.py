import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models import AuditLog


class AuditService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def log(
        self,
        event_type: str,
        user_id: uuid.UUID | None = None,
        device_id: uuid.UUID | None = None,
        ip: str | None = None,
        user_agent: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        entry = AuditLog(
            id=uuid.uuid4(),
            user_id=user_id,
            device_id=device_id,
            event_type=event_type,
            ip=ip,
            user_agent=user_agent,
            metadata=metadata,
        )
        self._db.add(entry)


audit = AuditService
