import json
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any

import jwt
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.core.redis import get_redis
from app.modules.websocket import events
from app.modules.websocket.manager import manager, publish_to_user

router = APIRouter(tags=["websocket"])

_PRESENCE_TTL = 60  # seconds


async def _authenticate_ws(websocket: WebSocket) -> tuple[uuid.UUID, uuid.UUID]:
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001)
        raise WebSocketDisconnect(code=4001)
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        return uuid.UUID(payload["sub"]), uuid.UUID(payload["device_id"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        await websocket.close(code=4001)
        raise WebSocketDisconnect(code=4001)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    user_id, device_id = await _authenticate_ws(websocket)
    redis = await get_redis()

    await manager.connect(websocket, user_id)

    # Presence: mark online
    await redis.setex(f"presence:{user_id}", _PRESENCE_TTL, "online")

    # Notify connected
    await websocket.send_text(json.dumps({
        "type": events.SERVER_CONNECTED,
        "payload": {"user_id": str(user_id), "device_id": str(device_id)},
    }))

    try:
        while True:
            raw = await websocket.receive_text()
            await _handle_client_event(raw, user_id, device_id, redis)
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(websocket, user_id)
        await redis.delete(f"presence:{user_id}")


async def _handle_client_event(
    raw: str,
    user_id: uuid.UUID,
    device_id: uuid.UUID,
    redis: Any,
) -> None:
    try:
        msg = json.loads(raw)
        event_type: str = msg.get("type", "")
        payload: dict = msg.get("payload", {})
    except (json.JSONDecodeError, AttributeError):
        return

    if event_type == events.CLIENT_TYPING_STARTED:
        chat_id = payload.get("chat_id")
        if chat_id:
            await redis.setex(f"typing:{chat_id}:{user_id}", 6, "1")
            await _broadcast_chat_event(redis, chat_id, {
                "type": events.SERVER_TYPING_STARTED,
                "payload": {"chat_id": chat_id, "user_id": str(user_id)},
            }, exclude=user_id)

    elif event_type == events.CLIENT_TYPING_STOPPED:
        chat_id = payload.get("chat_id")
        if chat_id:
            await redis.delete(f"typing:{chat_id}:{user_id}")
            await _broadcast_chat_event(redis, chat_id, {
                "type": events.SERVER_TYPING_STOPPED,
                "payload": {"chat_id": chat_id, "user_id": str(user_id)},
            }, exclude=user_id)

    elif event_type == events.CLIENT_PRESENCE_UPDATE:
        await redis.setex(f"presence:{user_id}", _PRESENCE_TTL, "online")

    elif event_type in (
        events.CLIENT_CALL_INVITE,
        events.CLIENT_CALL_ACCEPT,
        events.CLIENT_CALL_DECLINE,
        events.CLIENT_CALL_END,
        events.CLIENT_CALL_OFFER,
        events.CLIENT_CALL_ANSWER,
        events.CLIENT_CALL_ICE,
    ):
        peer_id_str = payload.get("peer_user_id")
        if peer_id_str:
            try:
                peer_id = uuid.UUID(peer_id_str)
                server_event = event_type.replace("call.", "call.")
                await publish_to_user(redis, peer_id, {
                    "type": server_event,
                    "payload": {**payload, "from_user_id": str(user_id)},
                })
            except ValueError:
                pass


async def _broadcast_chat_event(
    redis: Any, chat_id: str, event: dict, exclude: uuid.UUID | None = None
) -> None:
    members_key = f"chat_members:{chat_id}"
    members = await redis.smembers(members_key)
    for member_id_str in members:
        try:
            member_id = uuid.UUID(member_id_str)
            if member_id != exclude:
                await publish_to_user(redis, member_id, event)
        except ValueError:
            pass
