import uuid
from typing import Annotated

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.exceptions import UnauthorizedError
from app.core.security import decode_access_token

_bearer = HTTPBearer(auto_error=False)


async def get_current_user_id(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> uuid.UUID:
    if not credentials:
        raise UnauthorizedError("Missing bearer token")
    try:
        payload = decode_access_token(credentials.credentials)
        if payload.get("type") != "access":
            raise UnauthorizedError("Invalid token type")
        return uuid.UUID(payload["sub"])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, KeyError, ValueError):
        raise UnauthorizedError("Invalid or expired token")


async def get_current_device_id(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> uuid.UUID:
    if not credentials:
        raise UnauthorizedError("Missing bearer token")
    try:
        payload = decode_access_token(credentials.credentials)
        return uuid.UUID(payload["device_id"])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, KeyError, ValueError):
        raise UnauthorizedError("Invalid or expired token")


class CurrentUser:
    """Inject both user_id and device_id from JWT in a single Depends."""

    def __init__(
        self,
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    ) -> None:
        if not credentials:
            raise UnauthorizedError("Missing bearer token")
        try:
            payload = decode_access_token(credentials.credentials)
            if payload.get("type") != "access":
                raise UnauthorizedError("Invalid token type")
            self.user_id = uuid.UUID(payload["sub"])
            self.device_id = uuid.UUID(payload["device_id"])
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, KeyError, ValueError):
            raise UnauthorizedError("Invalid or expired token")
