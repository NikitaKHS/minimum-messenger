import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class AttachmentInitRequest(BaseModel):
    file_size: int = Field(gt=0, le=104_857_600)
    mime_type: str = Field(max_length=128)
    encrypted_file_key: str
    checksum: str | None = None


class AttachmentInitResponse(BaseModel):
    attachment_id: uuid.UUID
    upload_url: str
    storage_key: str


class AttachmentCompleteRequest(BaseModel):
    attachment_id: uuid.UUID


class DownloadUrlResponse(BaseModel):
    download_url: str
    expires_in: int
