import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class DirectChatCreate(BaseModel):
    other_user_id: uuid.UUID


class EncryptedGroupKeyIn(BaseModel):
    recipient_device_id: uuid.UUID
    encrypted_group_key: str
    key_version: int


class GroupChatCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    member_ids: list[uuid.UUID] = Field(min_length=1)


class GroupChatUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    avatar_url: str | None = None


class AddMemberRequest(BaseModel):
    user_id: uuid.UUID
    encrypted_group_keys: list[EncryptedGroupKeyIn]


class ChatMemberOut(BaseModel):
    user_id: uuid.UUID
    role: str
    joined_at: datetime
    left_at: datetime | None
    muted_until: datetime | None

    model_config = {"from_attributes": True}


class ChatOut(BaseModel):
    id: uuid.UUID
    type: str
    title: str | None
    avatar_url: str | None
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
