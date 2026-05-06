import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import Session


class AuthRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def create_session(self, session: Session) -> Session:
        self._db.add(session)
        await self._db.flush()
        return session

    async def get_session_by_token_hash(self, token_hash: str) -> Session | None:
        return await self._db.scalar(
            select(Session).where(
                Session.refresh_token_hash == token_hash,
                Session.revoked_at.is_(None),
                Session.expires_at > datetime.now(timezone.utc),
            )
        )

    async def revoke_session(self, session: Session) -> None:
        session.revoked_at = datetime.now(timezone.utc)
        await self._db.flush()

    async def revoke_all_user_sessions(self, user_id: uuid.UUID) -> None:
        sessions = await self._db.scalars(
            select(Session).where(Session.user_id == user_id, Session.revoked_at.is_(None))
        )
        now = datetime.now(timezone.utc)
        for s in sessions:
            s.revoked_at = now
        await self._db.flush()
