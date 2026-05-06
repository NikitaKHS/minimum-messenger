import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ConflictError, UnauthorizedError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_token,
    needs_rehash,
    verify_password,
)
from app.core.metrics import auth_attempts_total
from app.modules.audit.service import AuditService
from app.modules.auth.models import Session
from app.modules.auth.repository import AuthRepository
from app.modules.auth.schemas import LoginRequest, RegisterRequest, TokenResponse
from app.modules.devices.models import Device
from app.modules.devices.repository import DeviceRepository
from app.modules.users.models import User
from app.modules.users.repository import UserRepository


class AuthService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._auth_repo = AuthRepository(db)
        self._user_repo = UserRepository(db)
        self._device_repo = DeviceRepository(db)
        self._audit = AuditService(db)

    async def register(
        self, payload: RegisterRequest, ip: str, user_agent: str
    ) -> TokenResponse:
        if await self._user_repo.get_by_username(payload.username):
            raise ConflictError("Username already taken")
        if payload.email and await self._user_repo.get_by_email(payload.email):
            raise ConflictError("Email already registered")

        user = User(
            id=uuid.uuid4(),
            username=payload.username,
            email=payload.email,
            password_hash=hash_password(payload.password),
            status="active",
        )
        self._db.add(user)
        await self._db.flush()

        device = Device(
            id=uuid.uuid4(),
            user_id=user.id,
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

        tokens = await self._create_session(user.id, device.id, ip, user_agent)
        auth_attempts_total.labels(event="register_ok").inc()
        await self._audit.log(
            user_id=user.id, device_id=device.id, event_type="user.registered", ip=ip
        )
        return tokens

    async def login(
        self, payload: LoginRequest, ip: str, user_agent: str
    ) -> TokenResponse:
        user = await self._user_repo.get_by_username(payload.username)
        if not user or not verify_password(payload.password, user.password_hash):
            auth_attempts_total.labels(event="login_failed").inc()
            await self._audit.log(user_id=None, device_id=None, event_type="auth.login_failed", ip=ip)
            raise UnauthorizedError("Invalid credentials")

        if user.status == "banned":
            raise UnauthorizedError("Account suspended")

        if needs_rehash(user.password_hash):
            user.password_hash = hash_password(payload.password)
            await self._db.flush()

        device = await self._device_repo.get_by_fingerprint(user.id, payload.public_key_fingerprint)
        if not device:
            device = Device(
                id=uuid.uuid4(),
                user_id=user.id,
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

        tokens = await self._create_session(user.id, device.id, ip, user_agent)
        auth_attempts_total.labels(event="login_ok").inc()
        await self._audit.log(
            user_id=user.id, device_id=device.id, event_type="auth.login", ip=ip
        )
        return tokens

    async def refresh(self, refresh_token: str) -> TokenResponse:
        token_hash = hash_token(refresh_token)
        session = await self._auth_repo.get_session_by_token_hash(token_hash)
        if not session:
            raise UnauthorizedError("Invalid or expired refresh token")

        await self._auth_repo.revoke_session(session)

        device = await self._device_repo.get_by_id(session.device_id)
        if not device or not device.is_active:
            raise UnauthorizedError("Device revoked")

        return await self._create_session(
            session.user_id, session.device_id, str(session.ip or ""), session.user_agent or ""
        )

    async def logout(self, refresh_token: str) -> None:
        token_hash = hash_token(refresh_token)
        session = await self._auth_repo.get_session_by_token_hash(token_hash)
        if session:
            await self._auth_repo.revoke_session(session)

    async def _create_session(
        self, user_id: uuid.UUID, device_id: uuid.UUID, ip: str, user_agent: str
    ) -> TokenResponse:
        access_token = create_access_token(user_id, device_id)
        raw_refresh, refresh_hash = create_refresh_token()

        session = Session(
            id=uuid.uuid4(),
            user_id=user_id,
            device_id=device_id,
            refresh_token_hash=refresh_hash,
            ip=ip or None,
            user_agent=user_agent or None,
            expires_at=datetime.now(timezone.utc)
            + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )
        await self._auth_repo.create_session(session)

        return TokenResponse(
            access_token=access_token,
            refresh_token=raw_refresh,
            user_id=user_id,
            device_id=device_id,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )
