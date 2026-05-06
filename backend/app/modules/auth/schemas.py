import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_.-]+$")
    email: EmailStr | None = None
    password: str = Field(min_length=8, max_length=128)
    device_name: str = Field(min_length=1, max_length=128)
    device_type: str = Field(default="web", max_length=32)
    platform: str | None = Field(default=None, max_length=64)
    public_identity_key: str
    public_signed_prekey: str | None = None
    signed_prekey_signature: str | None = None
    public_key_fingerprint: str


class LoginRequest(BaseModel):
    username: str
    password: str
    device_name: str = Field(min_length=1, max_length=128)
    device_type: str = Field(default="web", max_length=32)
    platform: str | None = None
    public_identity_key: str
    public_signed_prekey: str | None = None
    signed_prekey_signature: str | None = None
    public_key_fingerprint: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: uuid.UUID
    device_id: uuid.UUID
    expires_in: int


class SessionOut(BaseModel):
    id: uuid.UUID
    user_agent: str | None
    ip: str | None
    created_at: datetime
    expires_at: datetime

    model_config = {"from_attributes": True}
