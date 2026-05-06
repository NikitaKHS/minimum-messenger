import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.messages.models import Message, MessageRecipient


class MessageRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def create(self, message: Message) -> Message:
        self._db.add(message)
        await self._db.flush()
        return message

    async def get_by_id(self, message_id: uuid.UUID) -> Message | None:
        return await self._db.scalar(
            select(Message).where(Message.id == message_id, Message.deleted_at.is_(None))
        )

    async def exists_by_idempotency(self, device_id: uuid.UUID, client_message_id: str) -> Message | None:
        return await self._db.scalar(
            select(Message).where(
                Message.sender_device_id == device_id,
                Message.client_message_id == client_message_id,
            )
        )

    async def list_by_chat(
        self,
        chat_id: uuid.UUID,
        before_id: uuid.UUID | None = None,
        limit: int = 50,
    ) -> list[Message]:
        q = select(Message).where(
            Message.chat_id == chat_id,
            Message.deleted_at.is_(None),
        )
        if before_id:
            anchor = await self.get_by_id(before_id)
            if anchor:
                q = q.where(Message.created_at < anchor.created_at)
        q = q.order_by(Message.created_at.desc()).limit(limit)
        result = await self._db.scalars(q)
        return list(result)

    async def mark_deleted(self, message: Message) -> None:
        message.deleted_at = datetime.now(timezone.utc)
        await self._db.flush()

    async def get_recipient(
        self, message_id: uuid.UUID, device_id: uuid.UUID
    ) -> MessageRecipient | None:
        return await self._db.scalar(
            select(MessageRecipient).where(
                MessageRecipient.message_id == message_id,
                MessageRecipient.recipient_device_id == device_id,
            )
        )
