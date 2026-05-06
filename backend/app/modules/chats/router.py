import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.chats.schemas import (
    AddMemberRequest,
    ChatMemberOut,
    ChatOut,
    DirectChatCreate,
    GroupChatCreate,
    GroupChatUpdate,
)
from app.modules.chats.service import ChatService
from app.shared.dependencies import CurrentUser, get_current_user_id

router = APIRouter(prefix="/chats", tags=["chats"])


def _get_service(db: AsyncSession = Depends(get_db)) -> ChatService:
    return ChatService(db)


@router.post("/direct", response_model=ChatOut, status_code=201)
async def create_direct(
    payload: DirectChatCreate,
    service: ChatService = Depends(_get_service),
    current: CurrentUser = Depends(),
) -> ChatOut:
    return await service.create_direct(current.user_id, payload)


@router.post("/group", response_model=ChatOut, status_code=201)
async def create_group(
    payload: GroupChatCreate,
    service: ChatService = Depends(_get_service),
    current: CurrentUser = Depends(),
) -> ChatOut:
    return await service.create_group(current.user_id, current.device_id, payload)


@router.get("", response_model=list[ChatOut])
async def list_chats(
    user_id: uuid.UUID = Depends(get_current_user_id),
    service: ChatService = Depends(_get_service),
) -> list[ChatOut]:
    return await service.list_chats(user_id)


@router.get("/{chat_id}", response_model=ChatOut)
async def get_chat(
    chat_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    service: ChatService = Depends(_get_service),
) -> ChatOut:
    return await service.get_chat(chat_id, user_id)


@router.patch("/{chat_id}", response_model=ChatOut)
async def update_chat(
    chat_id: uuid.UUID,
    payload: GroupChatUpdate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    service: ChatService = Depends(_get_service),
) -> ChatOut:
    return await service.update_group(chat_id, user_id, payload)


@router.get("/{chat_id}/members", response_model=list[ChatMemberOut])
async def list_members(
    chat_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    service: ChatService = Depends(_get_service),
) -> list[ChatMemberOut]:
    return await service.list_members(chat_id, user_id)


@router.post("/{chat_id}/members", status_code=204)
async def add_member(
    chat_id: uuid.UUID,
    payload: AddMemberRequest,
    service: ChatService = Depends(_get_service),
    current: CurrentUser = Depends(),
) -> None:
    await service.add_member(chat_id, current.user_id, current.device_id, payload)


@router.delete("/{chat_id}/members/{target_user_id}", status_code=204)
async def remove_member(
    chat_id: uuid.UUID,
    target_user_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    service: ChatService = Depends(_get_service),
) -> None:
    await service.remove_member(chat_id, user_id, target_user_id)


@router.post("/{chat_id}/leave", status_code=204)
async def leave_chat(
    chat_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    service: ChatService = Depends(_get_service),
) -> None:
    await service.leave(chat_id, user_id)
