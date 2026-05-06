import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.messages.schemas import MessageCursorPage, MessageOut, SendMessageRequest
from app.modules.messages.service import MessageService
from app.shared.dependencies import CurrentUser, get_current_user_id

router = APIRouter(tags=["messages"])


def _get_service(db: AsyncSession = Depends(get_db)) -> MessageService:
    return MessageService(db)


@router.post("/messages", response_model=MessageOut, status_code=201)
async def send_message(
    payload: SendMessageRequest,
    service: MessageService = Depends(_get_service),
    current: CurrentUser = Depends(),
) -> MessageOut:
    return await service.send(current.user_id, current.device_id, payload)


@router.get("/chats/{chat_id}/messages", response_model=MessageCursorPage)
async def get_history(
    chat_id: uuid.UUID,
    before: Annotated[uuid.UUID | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    service: MessageService = Depends(_get_service),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> MessageCursorPage:
    return await service.get_history(chat_id, user_id, before, limit)


@router.post("/messages/{message_id}/delivered", status_code=204)
async def mark_delivered(
    message_id: uuid.UUID,
    service: MessageService = Depends(_get_service),
    current: CurrentUser = Depends(),
) -> None:
    await service.mark_delivered(message_id, current.device_id)


@router.post("/messages/{message_id}/read", status_code=204)
async def mark_read(
    message_id: uuid.UUID,
    service: MessageService = Depends(_get_service),
    current: CurrentUser = Depends(),
) -> None:
    await service.mark_read(message_id, current.device_id)


@router.delete("/messages/{message_id}", status_code=204)
async def delete_message(
    message_id: uuid.UUID,
    service: MessageService = Depends(_get_service),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> None:
    await service.delete(message_id, user_id)
