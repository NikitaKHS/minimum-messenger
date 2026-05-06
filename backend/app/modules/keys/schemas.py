import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class OneTimePrekeyIn(BaseModel):
    key_id: int
    public_prekey: str


class OneTimePrekeyOut(BaseModel):
    key_id: int
    public_prekey: str


class PrekeyBundleOut(BaseModel):
    device_id: uuid.UUID
    user_id: uuid.UUID
    public_identity_key: str
    public_signed_prekey: str | None
    signed_prekey_signature: str | None
    public_key_fingerprint: str
    one_time_prekey: OneTimePrekeyOut | None = None


class FingerprintOut(BaseModel):
    device_id: uuid.UUID
    fingerprint: str
