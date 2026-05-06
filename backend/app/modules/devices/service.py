import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError
from app.modules.audit.service import AuditService
from app.modules.devices.models import Device
from app.modules.devices.repository import DeviceRepository
from app.modules.devices.schemas import DeviceOut, DeviceRegister


class DeviceService:
    def __init__(self, db: AsyncSession) -> None:
        self._repo = DeviceRepository(db)
        self._audit = AuditService(db)
        self._db = db

    async def register(
        self, user_id: uuid.UUID, payload: DeviceRegister
    ) -> DeviceOut:
        device = Device(
            id=uuid.uuid4(),
            user_id=user_id,
            device_name=payload.device_name,
            device_type=payload.device_type,
            platform=payload.platform,
            public_identity_key=payload.public_identity_key,
            public_signed_prekey=payload.public_signed_prekey,
            signed_prekey_signature=payload.signed_prekey_signature,
            public_key_fingerprint=payload.public_key_fingerprint,
            is_active=True,
        )
        self._db.add(device)
        await self._db.flush()
        await self._audit.log(
            user_id=user_id, device_id=device.id, event_type="device.registered"
        )
        return DeviceOut.model_validate(device)

    async def list_my_devices(self, user_id: uuid.UUID) -> list[DeviceOut]:
        devices = await self._repo.list_by_user(user_id)
        return [DeviceOut.model_validate(d) for d in devices]

    async def revoke(self, user_id: uuid.UUID, device_id: uuid.UUID) -> None:
        device = await self._repo.get_by_id(device_id)
        if not device:
            raise NotFoundError("Device not found")
        if device.user_id != user_id:
            raise ForbiddenError()
        await self._repo.revoke(device)
        await self._audit.log(
            user_id=user_id, device_id=device_id, event_type="device.revoked"
        )

    async def list_user_devices(self, user_id: uuid.UUID) -> list[DeviceOut]:
        devices = await self._repo.list_active(user_id)
        return [DeviceOut.model_validate(d) for d in devices]
