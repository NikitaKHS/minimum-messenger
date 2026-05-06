"""
Outbox pattern implementation.

OutboxService writes events to the outbox_events table.
OutboxWorker reads pending events and publishes them to Redis.
This guarantees at-least-once delivery even if the Redis publish fails.
"""
import asyncio
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.modules.workers.models import OutboxEvent

logger = get_logger(__name__)

_MAX_ATTEMPTS = 5
_RETRY_BASE_SECONDS = 5


class OutboxService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def publish(
        self,
        event_type: str,
        aggregate_type: str,
        aggregate_id: uuid.UUID,
        payload: dict[str, Any],
    ) -> None:
        event = OutboxEvent(
            id=uuid.uuid4(),
            event_type=event_type,
            aggregate_type=aggregate_type,
            aggregate_id=aggregate_id,
            payload=payload,
            status="pending",
        )
        self._db.add(event)


class OutboxWorker:
    def __init__(self, session_factory: Any, redis: Any) -> None:
        self._session_factory = session_factory
        self._redis = redis

    async def run(self, interval_seconds: float = 1.0) -> None:
        logger.info("outbox_worker.started")
        while True:
            try:
                await self._process_batch()
            except Exception as exc:
                logger.error("outbox_worker.error", error=str(exc))
            await asyncio.sleep(interval_seconds)

    async def _process_batch(self) -> None:
        async with self._session_factory() as db:
            now = datetime.now(timezone.utc)
            events = await db.scalars(
                select(OutboxEvent)
                .where(
                    OutboxEvent.status == "pending",
                    (OutboxEvent.next_retry_at.is_(None)) | (OutboxEvent.next_retry_at <= now),
                )
                .limit(100)
                .with_for_update(skip_locked=True)
            )
            events = list(events)

            for event in events:
                try:
                    await self._dispatch(event)
                    event.status = "processed"
                    event.processed_at = datetime.now(timezone.utc)
                except Exception as exc:
                    event.attempts += 1
                    if event.attempts >= _MAX_ATTEMPTS:
                        event.status = "failed"
                        logger.error("outbox.event_failed", event_id=str(event.id), error=str(exc))
                    else:
                        backoff = _RETRY_BASE_SECONDS * (2 ** event.attempts)
                        event.next_retry_at = datetime.now(timezone.utc) + timedelta(seconds=backoff)

            await db.commit()

    async def _dispatch(self, event: OutboxEvent) -> None:
        """Route outbox event to the right Redis channel(s)."""
        from app.modules.websocket.manager import publish_to_user

        payload = event.payload

        if event.event_type == "message.new":
            member_ids = payload.get("member_user_ids") or []
            for uid_str in member_ids:
                try:
                    uid = uuid.UUID(uid_str)
                    await publish_to_user(self._redis, uid, {
                        "type": "message.new",
                        "payload": payload,
                    })
                except ValueError:
                    pass

        elif event.event_type in ("message.delivered", "message.read"):
            message_id = payload.get("message_id")
            # Notify message sender — would require DB lookup; simplified here
            pass

        elif event.event_type in ("chat.created", "group.member_added", "group.member_removed"):
            chat_id = payload.get("chat_id")
            if chat_id:
                members = await self._redis.smembers(f"chat_members:{chat_id}")
                for uid_str in members:
                    try:
                        uid = uuid.UUID(uid_str)
                        await publish_to_user(self._redis, uid, {
                            "type": event.event_type,
                            "payload": payload,
                        })
                    except ValueError:
                        pass
