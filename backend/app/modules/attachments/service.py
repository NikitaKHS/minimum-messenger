import uuid

import aiobotocore.session
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import NotFoundError, UnprocessableError
from app.modules.attachments.models import Attachment
from app.modules.attachments.schemas import (
    AttachmentCompleteRequest,
    AttachmentInitRequest,
    AttachmentInitResponse,
    DownloadUrlResponse,
)


class AttachmentService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def init_upload(
        self, uploader_user_id: uuid.UUID, payload: AttachmentInitRequest
    ) -> AttachmentInitResponse:
        attachment_id = uuid.uuid4()
        storage_key = f"attachments/{uploader_user_id}/{attachment_id}"

        attachment = Attachment(
            id=attachment_id,
            storage_key=storage_key,
            file_size=payload.file_size,
            mime_type=payload.mime_type,
            encrypted_file_key=payload.encrypted_file_key,
            checksum=payload.checksum,
            upload_status="pending",
        )
        self._db.add(attachment)
        await self._db.flush()

        upload_url = await self._generate_presigned_put(storage_key, payload.mime_type)
        return AttachmentInitResponse(
            attachment_id=attachment_id,
            upload_url=upload_url,
            storage_key=storage_key,
        )

    async def complete_upload(self, payload: AttachmentCompleteRequest) -> None:
        attachment = await self._db.scalar(
            select(Attachment).where(Attachment.id == payload.attachment_id)
        )
        if not attachment:
            raise NotFoundError("Attachment not found")
        if attachment.upload_status != "pending":
            raise UnprocessableError("Attachment already processed")
        attachment.upload_status = "completed"
        await self._db.flush()

    async def get_download_url(self, attachment_id: uuid.UUID) -> DownloadUrlResponse:
        attachment = await self._db.scalar(
            select(Attachment).where(
                Attachment.id == attachment_id,
                Attachment.upload_status == "completed",
            )
        )
        if not attachment:
            raise NotFoundError("Attachment not found")

        url = await self._generate_presigned_get(attachment.storage_key)
        return DownloadUrlResponse(download_url=url, expires_in=settings.S3_PRESIGNED_EXPIRY_SECONDS)

    async def _generate_presigned_put(self, key: str, content_type: str) -> str:
        return await self._presign("put_object", key, content_type)

    async def _generate_presigned_get(self, key: str) -> str:
        return await self._presign("get_object", key, None)

    async def _presign(self, operation: str, key: str, content_type: str | None) -> str:
        session = aiobotocore.session.get_session()
        async with session.create_client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY_ID,
            aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
            region_name=settings.S3_REGION,
        ) as client:
            params: dict = {"Bucket": settings.S3_BUCKET_NAME, "Key": key}
            if content_type:
                params["ContentType"] = content_type
            url = await client.generate_presigned_url(
                operation, Params=params, ExpiresIn=settings.S3_PRESIGNED_EXPIRY_SECONDS
            )
            return url
