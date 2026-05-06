import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.attachments.schemas import (
    AttachmentCompleteRequest,
    AttachmentInitRequest,
    AttachmentInitResponse,
    DownloadUrlResponse,
)
from app.modules.attachments.service import AttachmentService
from app.shared.dependencies import get_current_user_id

router = APIRouter(prefix="/attachments", tags=["attachments"])


def _get_service(db: AsyncSession = Depends(get_db)) -> AttachmentService:
    return AttachmentService(db)


@router.post("/init", response_model=AttachmentInitResponse, status_code=201)
async def init_upload(
    payload: AttachmentInitRequest,
    service: AttachmentService = Depends(_get_service),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> AttachmentInitResponse:
    return await service.init_upload(user_id, payload)


@router.post("/complete", status_code=204)
async def complete_upload(
    payload: AttachmentCompleteRequest,
    service: AttachmentService = Depends(_get_service),
    _: uuid.UUID = Depends(get_current_user_id),
) -> None:
    await service.complete_upload(payload)


@router.get("/{attachment_id}/download-url", response_model=DownloadUrlResponse)
async def get_download_url(
    attachment_id: uuid.UUID,
    service: AttachmentService = Depends(_get_service),
    _: uuid.UUID = Depends(get_current_user_id),
) -> DownloadUrlResponse:
    return await service.get_download_url(attachment_id)
