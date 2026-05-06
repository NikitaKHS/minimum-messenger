"""
WebSocket connection manager with Redis pub/sub for multi-instance support.

Each user's events are published to Redis channel `ws:user:{user_id}`.
All backend instances subscribe to channels for their connected users.
"""
import asyncio
import json
import uuid
from collections import defaultdict
from typing import Any

from fastapi import WebSocket
from redis.asyncio import Redis

from app.core.logging import get_logger
from app.core.metrics import ws_active_connections

logger = get_logger(__name__)

_CHANNEL_PREFIX = "ws:user:"


class ConnectionManager:
    def __init__(self) -> None:
        # user_id → set of WebSocket connections (multiple devices per user)
        self._connections: dict[uuid.UUID, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, user_id: uuid.UUID) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[user_id].add(websocket)
        ws_active_connections.inc()
        logger.info("ws.connected", user_id=str(user_id))

    async def disconnect(self, websocket: WebSocket, user_id: uuid.UUID) -> None:
        async with self._lock:
            self._connections[user_id].discard(websocket)
            if not self._connections[user_id]:
                del self._connections[user_id]
        ws_active_connections.dec()
        logger.info("ws.disconnected", user_id=str(user_id))

    async def send_to_user(self, user_id: uuid.UUID, event: dict[str, Any]) -> None:
        sockets = set(self._connections.get(user_id, set()))
        dead = set()
        for ws in sockets:
            try:
                await ws.send_text(json.dumps(event))
            except Exception:
                dead.add(ws)
        if dead:
            async with self._lock:
                self._connections[user_id] -= dead

    def is_connected(self, user_id: uuid.UUID) -> bool:
        return bool(self._connections.get(user_id))

    @property
    def active_user_ids(self) -> set[uuid.UUID]:
        return set(self._connections.keys())


# Singleton shared across the application
manager = ConnectionManager()


async def publish_to_user(redis: Redis, user_id: uuid.UUID, event: dict[str, Any]) -> None:
    channel = f"{_CHANNEL_PREFIX}{user_id}"
    await redis.publish(channel, json.dumps(event))


async def redis_subscriber(redis: Redis) -> None:
    """Background task: subscribe to Redis and relay events to local WS connections."""
    pubsub = redis.pubsub()
    await pubsub.psubscribe(f"{_CHANNEL_PREFIX}*")
    logger.info("redis_subscriber.started")

    async for raw in pubsub.listen():
        if raw["type"] != "pmessage":
            continue
        try:
            raw_channel = raw["channel"]
            channel: str = raw_channel.decode() if isinstance(raw_channel, bytes) else raw_channel
            user_id_str = channel.removeprefix(_CHANNEL_PREFIX)
            user_id = uuid.UUID(user_id_str)
            event = json.loads(raw["data"])
            await manager.send_to_user(user_id, event)
        except Exception as exc:
            logger.error("redis_subscriber.error", error=str(exc))
