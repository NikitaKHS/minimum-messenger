import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class DeviceRegister(BaseModel):
    device_name: str = Field(min_length=1, max_length=128)
    device_type: str = Field(default="web", max_length=32)
    platform: str | None = Field(default=None, max_length=64)
    public_identity_key: str
    public_signed_prekey: str | None = None
    signed_prekey_signature: str | None = None
    public_key_fingerprint: str


class DeviceOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    device_name: str
    device_type: str
    platform: str | None
    public_identity_key: str | None = None
    public_key_fingerprint: str
    is_active: bool
    created_at: datetime
    last_seen_at: datetime | None
    revoked_at: datetime | None

    model_config = {"from_attributes": True}


class DevicePublicKeys(BaseModel):
    device_id: uuid.UUID
    public_identity_key: str
    public_signed_prekey: str | None
    signed_prekey_signature: str | None
    public_key_fingerprint: str

    model_config = {"from_attributes": True}
