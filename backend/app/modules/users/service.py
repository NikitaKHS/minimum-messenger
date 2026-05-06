import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, UnauthorizedError
from app.core.security import hash_password, verify_password
from app.modules.users.models import User
from app.modules.users.repository import UserRepository
from app.modules.users.schemas import UserOut, UserUpdate


class UserService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._repo = UserRepository(db)

    async def get_me(self, user_id: uuid.UUID) -> UserOut:
        user = await self._repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")
        return UserOut.model_validate(user)

    async def update_me(self, user_id: uuid.UUID, payload: UserUpdate) -> UserOut:
        user = await self._repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")

        if payload.new_password:
            if not payload.current_password or not verify_password(
                payload.current_password, user.password_hash
            ):
                raise UnauthorizedError("Current password is incorrect")
            user.password_hash = hash_password(payload.new_password)

        if payload.email is not None:
            user.email = payload.email

        await self._db.flush()
        return UserOut.model_validate(user)

    async def get_by_id(self, user_id: uuid.UUID) -> UserOut:
        user = await self._repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")
        return UserOut.model_validate(user)

    async def search(self, query: str) -> list[UserOut]:
        users = await self._repo.search(query)
        return [UserOut.model_validate(u) for u in users]
