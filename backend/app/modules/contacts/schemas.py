import uuid
from datetime import datetime

from pydantic import BaseModel


class ContactCreate(BaseModel):
    contact_user_id: uuid.UUID
    alias: str | None = None


class ContactOut(BaseModel):
    id: uuid.UUID
    contact_user_id: uuid.UUID
    alias: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}
