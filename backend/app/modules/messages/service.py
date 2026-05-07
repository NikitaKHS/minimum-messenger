import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.modules.attachments.models import Attachment
from app.modules.users.models import User as UserModel
from app.core.metrics import messages_sent_total
from app.modules.chats.repository import ChatRepository
from app.modules.devices.repository import DeviceRepository
from app.modules.messages.models import GroupMessageKey, Message, MessageRecipient
from app.modules.messages.repository import MessageRepository
from app.modules.messages.schemas import (
    MessageCursorPage,
    MessageOut,
    SendMessageRequest,
)
from app.modules.workers.outbox import OutboxService


class MessageService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._repo = MessageRepository(db)
        self._chat_repo = ChatRepository(db)
        self._device_repo = DeviceRepository(db)
        self._outbox = OutboxService(db)

    async def send(
        self,
        sender_user_id: uuid.UUID,
        sender_device_id: uuid.UUID,
        payload: SendMessageRequest,
    ) -> MessageOut:
        member = await self._chat_repo.get_member(payload.chat_id, sender_user_id)
        if not member:
            raise ForbiddenError("Not a member of this chat")

        existing = await self._repo.exists_by_idempotency(sender_device_id, payload.client_message_id)
        if existing:
            return MessageOut.model_validate(existing)

        message = Message(
            id=uuid.uuid4(),
            chat_id=payload.chat_id,
            sender_user_id=sender_user_id,
            sender_device_id=sender_device_id,
            client_message_id=payload.client_message_id,
            encrypted_payload=payload.encrypted_payload,
            encryption_version=payload.encryption_version,
            message_type=payload.message_type,
        )
        await self._repo.create(message)
        messages_sent_total.labels(chat_type="unknown").inc()

        chat_members = await self._chat_repo.list_members(payload.chat_id)
        for cm in chat_members:
            if cm.user_id == sender_user_id:
                continue
            devices = await self._device_repo.list_active(cm.user_id)
            for device in devices:
                self._db.add(
                    MessageRecipient(
                        id=uuid.uuid4(),
                        message_id=message.id,
                        recipient_user_id=cm.user_id,
                        recipient_device_id=device.id,
                        delivery_status="pending",
                    )
                )

        for gk in payload.group_keys:
            self._db.add(
                GroupMessageKey(
                    id=uuid.uuid4(),
                    chat_id=payload.chat_id,
                    message_id=message.id,
                    recipient_user_id=gk.recipient_user_id,
                    recipient_device_id=gk.recipient_device_id,
                    encrypted_group_key=gk.encrypted_group_key,
                    key_version=gk.key_version,
                )
            )

        if payload.attachment_id:
            attachment = await self._db.scalar(
                select(Attachment).where(
                    Attachment.id == payload.attachment_id,
                    Attachment.upload_status == "completed",
                )
            )
            if attachment:
                attachment.message_id = message.id

        await self._db.flush()
        all_members = await self._chat_repo.list_members(payload.chat_id)
        sender_username = await self._db.scalar(
            select(UserModel.username).where(UserModel.id == sender_user_id)
        )
        await self._outbox.publish(
            "message.new",
            "message",
            message.id,
            {
                "message_id": str(message.id),
                "chat_id": str(message.chat_id),
                "sender_user_id": str(sender_user_id),
                "sender_device_id": str(sender_device_id),
                "sender_username": sender_username,
                "encrypted_payload": payload.encrypted_payload,
                "encryption_version": payload.encryption_version,
                "attachment_id": str(payload.attachment_id) if payload.attachment_id else None,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "member_user_ids": [str(m.user_id) for m in all_members],
            },
        )
        return MessageOut.model_validate(message).model_copy(
            update={"sender_username": sender_username, "attachment_id": payload.attachment_id}
        )

    async def get_history(
        self,
        chat_id: uuid.UUID,
        user_id: uuid.UUID,
        before_id: uuid.UUID | None = None,
        limit: int = 50,
    ) -> MessageCursorPage:
        member = await self._chat_repo.get_member(chat_id, user_id)
        if not member:
            raise ForbiddenError("Not a member")

        messages = await self._repo.list_by_chat(chat_id, before_id, limit + 1)
        has_more = len(messages) > limit
        items = messages[:limit]

        sender_ids = list({m.sender_user_id for m in items})
        if sender_ids:
            rows = await self._db.execute(
                select(UserModel.id, UserModel.username).where(UserModel.id.in_(sender_ids))
            )
            usernames: dict[uuid.UUID, str] = {row.id: row.username for row in rows}
        else:
            usernames = {}

        msg_ids = [m.id for m in items]
        if msg_ids:
            att_rows = await self._db.execute(
                select(Attachment.message_id, Attachment.id).where(
                    Attachment.message_id.in_(msg_ids),
                    Attachment.upload_status == "completed",
                )
            )
            attachment_map: dict[uuid.UUID, uuid.UUID] = {row.message_id: row.id for row in att_rows}
        else:
            attachment_map = {}

        return MessageCursorPage(
            items=[
                MessageOut.model_validate(m).model_copy(
                    update={
                        "sender_username": usernames.get(m.sender_user_id),
                        "attachment_id": attachment_map.get(m.id),
                    }
                )
                for m in items
            ],
            next_cursor=str(items[-1].id) if has_more and items else None,
            has_more=has_more,
        )

    async def mark_delivered(
        self, message_id: uuid.UUID, device_id: uuid.UUID
    ) -> None:
        recipient = await self._repo.get_recipient(message_id, device_id)
        if not recipient:
            return
        if recipient.delivery_status == "pending":
            recipient.delivery_status = "delivered"
            recipient.delivered_at = datetime.now(timezone.utc)
            await self._outbox.publish(
                "message.delivered", "message", message_id,
                {"message_id": str(message_id), "device_id": str(device_id)}
            )

    async def mark_read(self, message_id: uuid.UUID, device_id: uuid.UUID) -> None:
        recipient = await self._repo.get_recipient(message_id, device_id)
        if not recipient:
            return
        if recipient.delivery_status != "read":
            recipient.delivery_status = "read"
            recipient.read_at = datetime.now(timezone.utc)
            await self._outbox.publish(
                "message.read", "message", message_id,
                {"message_id": str(message_id), "device_id": str(device_id)}
            )

    async def delete(
        self, message_id: uuid.UUID, user_id: uuid.UUID
    ) -> None:
        message = await self._repo.get_by_id(message_id)
        if not message:
            raise NotFoundError()
        if message.sender_user_id != user_id:
            raise ForbiddenError("Can only delete own messages")
        await self._repo.mark_deleted(message)
