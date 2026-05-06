import uuid
from datetime import datetime, timezone

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.chats.models import Chat, ChatMember


class ChatRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_by_id(self, chat_id: uuid.UUID) -> Chat | None:
        return await self._db.scalar(
            select(Chat).where(Chat.id == chat_id, Chat.deleted_at.is_(None))
        )

    async def get_direct(self, user_a: uuid.UUID, user_b: uuid.UUID) -> Chat | None:
        sub_a = select(ChatMember.chat_id).where(ChatMember.user_id == user_a, ChatMember.left_at.is_(None))
        sub_b = select(ChatMember.chat_id).where(ChatMember.user_id == user_b, ChatMember.left_at.is_(None))
        return await self._db.scalar(
            select(Chat).where(
                Chat.type == "direct",
                Chat.id.in_(sub_a),
                Chat.id.in_(sub_b),
                Chat.deleted_at.is_(None),
            )
        )

    async def list_for_user(self, user_id: uuid.UUID) -> list[Chat]:
        member_sub = select(ChatMember.chat_id).where(
            ChatMember.user_id == user_id, ChatMember.left_at.is_(None)
        )
        result = await self._db.scalars(
            select(Chat).where(Chat.id.in_(member_sub), Chat.deleted_at.is_(None))
        )
        return list(result)

    async def get_member(self, chat_id: uuid.UUID, user_id: uuid.UUID) -> ChatMember | None:
        return await self._db.scalar(
            select(ChatMember).where(
                ChatMember.chat_id == chat_id,
                ChatMember.user_id == user_id,
                ChatMember.left_at.is_(None),
            )
        )

    async def list_members(self, chat_id: uuid.UUID) -> list[ChatMember]:
        result = await self._db.scalars(
            select(ChatMember).where(
                ChatMember.chat_id == chat_id,
                ChatMember.left_at.is_(None),
            )
        )
        return list(result)

    async def remove_member(self, member: ChatMember) -> None:
        member.left_at = datetime.now(timezone.utc)
        await self._db.flush()
