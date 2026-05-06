import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.modules.audit.service import AuditService
from app.modules.chats.models import Chat, ChatMember
from app.modules.chats.repository import ChatRepository
from app.modules.chats.schemas import (
    AddMemberRequest,
    ChatMemberOut,
    ChatOut,
    DirectChatCreate,
    EncryptedGroupKeyIn,
    GroupChatCreate,
    GroupChatUpdate,
)
from app.modules.devices.models import Device
from app.modules.messages.models import ChatKeyVersion, GroupMessageKey
from app.modules.workers.outbox import OutboxService


class ChatService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._repo = ChatRepository(db)
        self._audit = AuditService(db)
        self._outbox = OutboxService(db)

    async def create_direct(
        self, creator_id: uuid.UUID, payload: DirectChatCreate
    ) -> ChatOut:
        existing = await self._repo.get_direct(creator_id, payload.other_user_id)
        if existing:
            return ChatOut.model_validate(existing)

        chat = Chat(id=uuid.uuid4(), type="direct", created_by=creator_id)
        self._db.add(chat)
        await self._db.flush()

        now = datetime.now(timezone.utc)
        for uid in (creator_id, payload.other_user_id):
            self._db.add(
                ChatMember(
                    id=uuid.uuid4(),
                    chat_id=chat.id,
                    user_id=uid,
                    role="member",
                    joined_at=now,
                )
            )
        await self._db.flush()
        await self._outbox.publish(
            "chat.created", "chat", chat.id, {"chat_id": str(chat.id), "type": "direct"}
        )
        return ChatOut.model_validate(chat)

    async def create_group(
        self,
        creator_id: uuid.UUID,
        creator_device_id: uuid.UUID,
        payload: GroupChatCreate,
    ) -> ChatOut:
        chat = Chat(id=uuid.uuid4(), type="group", title=payload.title, created_by=creator_id)
        self._db.add(chat)
        await self._db.flush()

        now = datetime.now(timezone.utc)
        all_members = list({creator_id, *payload.member_ids})
        for uid in all_members:
            role = "owner" if uid == creator_id else "member"
            self._db.add(
                ChatMember(
                    id=uuid.uuid4(),
                    chat_id=chat.id,
                    user_id=uid,
                    role=role,
                    joined_at=now,
                )
            )

        # Record key version 1 — actual group key encryption happens on first message send
        self._db.add(
            ChatKeyVersion(
                id=uuid.uuid4(),
                chat_id=chat.id,
                version=1,
                created_by_device_id=creator_device_id,
                reason="group_created",
            )
        )
        await self._db.flush()
        await self._outbox.publish(
            "chat.created", "chat", chat.id, {"chat_id": str(chat.id), "type": "group"}
        )
        return ChatOut.model_validate(chat)

    async def list_chats(self, user_id: uuid.UUID) -> list[ChatOut]:
        chats = await self._repo.list_for_user(user_id)
        return [ChatOut.model_validate(c) for c in chats]

    async def get_chat(self, chat_id: uuid.UUID, user_id: uuid.UUID) -> ChatOut:
        await self._assert_member(chat_id, user_id)
        chat = await self._repo.get_by_id(chat_id)
        if not chat:
            raise NotFoundError("Chat not found")
        return ChatOut.model_validate(chat)

    async def update_group(
        self, chat_id: uuid.UUID, user_id: uuid.UUID, payload: GroupChatUpdate
    ) -> ChatOut:
        chat = await self._repo.get_by_id(chat_id)
        if not chat:
            raise NotFoundError()
        await self._assert_admin(chat_id, user_id)
        if payload.title is not None:
            chat.title = payload.title
        if payload.avatar_url is not None:
            chat.avatar_url = payload.avatar_url
        await self._db.flush()
        return ChatOut.model_validate(chat)

    async def list_members(self, chat_id: uuid.UUID, user_id: uuid.UUID) -> list[ChatMemberOut]:
        await self._assert_member(chat_id, user_id)
        members = await self._repo.list_members(chat_id)
        return [ChatMemberOut.model_validate(m) for m in members]

    async def add_member(
        self,
        chat_id: uuid.UUID,
        actor_id: uuid.UUID,
        actor_device_id: uuid.UUID,
        payload: AddMemberRequest,
    ) -> None:
        chat = await self._repo.get_by_id(chat_id)
        if not chat or chat.type != "group":
            raise NotFoundError("Group chat not found")
        await self._assert_admin(chat_id, actor_id)

        existing = await self._repo.get_member(chat_id, payload.user_id)
        if existing:
            raise ConflictError("User already a member")

        self._db.add(
            ChatMember(
                id=uuid.uuid4(),
                chat_id=chat_id,
                user_id=payload.user_id,
                role="member",
                joined_at=datetime.now(timezone.utc),
            )
        )
        await self._db.flush()

        await self._rotate_group_key(
            chat_id, actor_device_id, payload.encrypted_group_keys, reason="member_added"
        )
        await self._outbox.publish(
            "group.member_added",
            "chat",
            chat_id,
            {"chat_id": str(chat_id), "user_id": str(payload.user_id)},
        )

    async def remove_member(
        self, chat_id: uuid.UUID, actor_id: uuid.UUID, target_user_id: uuid.UUID
    ) -> None:
        chat = await self._repo.get_by_id(chat_id)
        if not chat or chat.type != "group":
            raise NotFoundError()
        await self._assert_admin(chat_id, actor_id)

        member = await self._repo.get_member(chat_id, target_user_id)
        if not member:
            raise NotFoundError("Member not found")
        await self._repo.remove_member(member)
        await self._outbox.publish(
            "group.member_removed",
            "chat",
            chat_id,
            {"chat_id": str(chat_id), "user_id": str(target_user_id)},
        )

    async def leave(self, chat_id: uuid.UUID, user_id: uuid.UUID) -> None:
        member = await self._repo.get_member(chat_id, user_id)
        if not member:
            raise NotFoundError("Not a member")
        await self._repo.remove_member(member)

    async def _rotate_group_key(
        self,
        chat_id: uuid.UUID,
        acting_device_id: uuid.UUID,
        encrypted_keys: list[EncryptedGroupKeyIn],
        reason: str,
    ) -> int:
        from sqlalchemy import func

        max_version = await self._db.scalar(
            select(func.max(ChatKeyVersion.version)).where(ChatKeyVersion.chat_id == chat_id)
        ) or 0
        new_version = max_version + 1

        self._db.add(
            ChatKeyVersion(
                id=uuid.uuid4(),
                chat_id=chat_id,
                version=new_version,
                created_by_device_id=acting_device_id,
                reason=reason,
            )
        )

        # Look up user_id for each recipient device
        for ek in encrypted_keys:
            device = await self._db.scalar(
                select(Device).where(Device.id == ek.recipient_device_id)
            )
            if not device:
                continue
            self._db.add(
                GroupMessageKey(
                    id=uuid.uuid4(),
                    chat_id=chat_id,
                    message_id=None,
                    recipient_device_id=ek.recipient_device_id,
                    recipient_user_id=device.user_id,
                    encrypted_group_key=ek.encrypted_group_key,
                    key_version=new_version,
                )
            )
        await self._db.flush()
        return new_version

    async def _assert_member(self, chat_id: uuid.UUID, user_id: uuid.UUID) -> ChatMember:
        member = await self._repo.get_member(chat_id, user_id)
        if not member:
            raise ForbiddenError("Not a member of this chat")
        return member

    async def _assert_admin(self, chat_id: uuid.UUID, user_id: uuid.UUID) -> ChatMember:
        member = await self._repo.get_member(chat_id, user_id)
        if not member or member.role not in ("owner", "admin"):
            raise ForbiddenError("Insufficient permissions")
        return member
