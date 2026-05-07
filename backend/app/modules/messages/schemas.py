import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class EncryptedGroupKeyIn(BaseModel):
    recipient_user_id: uuid.UUID
    recipient_device_id: uuid.UUID
    encrypted_group_key: str
    key_version: int


class SendMessageRequest(BaseModel):
    chat_id: uuid.UUID
    client_message_id: str = Field(min_length=1, max_length=128)
    encrypted_payload: str
    encryption_version: str = "v1"
    message_type: str = Field(default="text", pattern="^(text|attachment|system)$")
    group_keys: list[EncryptedGroupKeyIn] = Field(default_factory=list)
    attachment_id: uuid.UUID | None = None


class MessageOut(BaseModel):
    id: uuid.UUID
    chat_id: uuid.UUID
    sender_user_id: uuid.UUID
    sender_device_id: uuid.UUID
    client_message_id: str
    encrypted_payload: str
    encryption_version: str
    message_type: str
    created_at: datetime
    edited_at: datetime | None
    deleted_at: datetime | None
    sender_username: str | None = None

    model_config = {"from_attributes": True}


class MessageCursorPage(BaseModel):
    items: list[MessageOut]
    next_cursor: str | None
    has_more: bool


class DeliveryStatusUpdate(BaseModel):
    message_id: uuid.UUID
