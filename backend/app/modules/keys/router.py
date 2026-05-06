import uuid
from typing import Annotated

from fastapi import APIRouter, Body, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.keys.schemas import (
    FingerprintOut,
    OneTimePrekeyIn,
    PrekeyBundleOut,
)
from app.modules.keys.service import KeyService
from app.shared.dependencies import CurrentUser, get_current_user_id

router = APIRouter(prefix="/keys", tags=["keys"])


def _get_service(db: AsyncSession = Depends(get_db)) -> KeyService:
    return KeyService(db)


@router.get("/users/{user_id}/devices", response_model=list[PrekeyBundleOut])
async def get_user_key_bundles(
    user_id: uuid.UUID,
    service: KeyService = Depends(_get_service),
    _: uuid.UUID = Depends(get_current_user_id),
) -> list[PrekeyBundleOut]:
    return await service.get_user_key_bundles(user_id)


@router.get("/devices/{device_id}", response_model=PrekeyBundleOut)
async def get_device_key_bundle(
    device_id: uuid.UUID,
    service: KeyService = Depends(_get_service),
    _: uuid.UUID = Depends(get_current_user_id),
) -> PrekeyBundleOut:
    return await service.get_key_bundle(device_id)


@router.post("/prekeys", status_code=204)
async def upload_prekeys(
    device_id: uuid.UUID,
    prekeys: Annotated[list[OneTimePrekeyIn], Body()],
    service: KeyService = Depends(_get_service),
    current: CurrentUser = Depends(),
) -> None:
    await service.upload_prekeys(device_id, current.user_id, prekeys)


@router.get("/fingerprint/{device_id}", response_model=FingerprintOut)
async def get_fingerprint(
    device_id: uuid.UUID,
    service: KeyService = Depends(_get_service),
    _: uuid.UUID = Depends(get_current_user_id),
) -> FingerprintOut:
    return await service.get_fingerprint(device_id)
