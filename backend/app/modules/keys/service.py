import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.devices.repository import DeviceRepository
from app.modules.keys.models import OneTimePrekey
from app.modules.keys.repository import KeyRepository
from app.modules.keys.schemas import (
    FingerprintOut,
    OneTimePrekeyIn,
    PrekeyBundleOut,
    OneTimePrekeyOut,
)


class KeyService:
    def __init__(self, db: AsyncSession) -> None:
        self._repo = KeyRepository(db)
        self._device_repo = DeviceRepository(db)

    async def upload_prekeys(
        self, device_id: uuid.UUID, owner_user_id: uuid.UUID, prekeys: list[OneTimePrekeyIn]
    ) -> None:
        device = await self._device_repo.get_by_id(device_id)
        if not device or device.user_id != owner_user_id or not device.is_active:
            raise NotFoundError("Device not found or access denied")

        new_prekeys = [
            OneTimePrekey(
                id=uuid.uuid4(),
                device_id=device_id,
                key_id=pk.key_id,
                public_prekey=pk.public_prekey,
            )
            for pk in prekeys
        ]
        await self._repo.add_prekeys(new_prekeys)

    async def get_key_bundle(self, device_id: uuid.UUID) -> PrekeyBundleOut:
        device = await self._device_repo.get_by_id(device_id)
        if not device or not device.is_active:
            raise NotFoundError("Device not found")

        one_time = await self._repo.pop_one_time_prekey(device_id)
        return PrekeyBundleOut(
            device_id=device.id,
            user_id=device.user_id,
            public_identity_key=device.public_identity_key,
            public_signed_prekey=device.public_signed_prekey,
            signed_prekey_signature=device.signed_prekey_signature,
            public_key_fingerprint=device.public_key_fingerprint,
            one_time_prekey=OneTimePrekeyOut(
                key_id=one_time.key_id,
                public_prekey=one_time.public_prekey,
            ) if one_time else None,
        )

    async def get_user_key_bundles(self, user_id: uuid.UUID) -> list[PrekeyBundleOut]:
        devices = await self._device_repo.list_active(user_id)
        bundles = []
        for device in devices:
            one_time = await self._repo.pop_one_time_prekey(device.id)
            bundles.append(PrekeyBundleOut(
                device_id=device.id,
                user_id=device.user_id,
                public_identity_key=device.public_identity_key,
                public_signed_prekey=device.public_signed_prekey,
                signed_prekey_signature=device.signed_prekey_signature,
                public_key_fingerprint=device.public_key_fingerprint,
                one_time_prekey=OneTimePrekeyOut(
                    key_id=one_time.key_id,
                    public_prekey=one_time.public_prekey,
                ) if one_time else None,
            ))
        return bundles

    async def get_fingerprint(self, device_id: uuid.UUID) -> FingerprintOut:
        device = await self._device_repo.get_by_id(device_id)
        if not device:
            raise NotFoundError("Device not found")
        return FingerprintOut(device_id=device.id, fingerprint=device.public_key_fingerprint)
