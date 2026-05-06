import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.devices.schemas import DeviceOut, DeviceRegister
from app.modules.devices.service import DeviceService
from app.shared.dependencies import get_current_user_id

router = APIRouter(tags=["devices"])


def _get_service(db: AsyncSession = Depends(get_db)) -> DeviceService:
    return DeviceService(db)


@router.post("/devices", response_model=DeviceOut, status_code=201)
async def register_device(
    payload: DeviceRegister,
    user_id: uuid.UUID = Depends(get_current_user_id),
    service: DeviceService = Depends(_get_service),
) -> DeviceOut:
    return await service.register(user_id, payload)


@router.get("/devices", response_model=list[DeviceOut])
async def list_devices(
    user_id: uuid.UUID = Depends(get_current_user_id),
    service: DeviceService = Depends(_get_service),
) -> list[DeviceOut]:
    return await service.list_my_devices(user_id)


@router.delete("/devices/{device_id}", status_code=204)
async def revoke_device(
    device_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    service: DeviceService = Depends(_get_service),
) -> None:
    await service.revoke(user_id, device_id)


@router.get("/users/{user_id}/devices", response_model=list[DeviceOut])
async def list_user_devices(
    user_id: uuid.UUID,
    service: DeviceService = Depends(_get_service),
    _: uuid.UUID = Depends(get_current_user_id),
) -> list[DeviceOut]:
    return await service.list_user_devices(user_id)
