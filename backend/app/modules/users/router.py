import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.users.schemas import UserOut, UserUpdate
from app.modules.users.service import UserService
from app.shared.dependencies import get_current_user_id

router = APIRouter(prefix="/users", tags=["users"])


def _get_service(db: AsyncSession = Depends(get_db)) -> UserService:
    return UserService(db)


@router.get("/me", response_model=UserOut)
async def get_me(
    user_id: uuid.UUID = Depends(get_current_user_id),
    service: UserService = Depends(_get_service),
) -> UserOut:
    return await service.get_me(user_id)


@router.patch("/me", response_model=UserOut)
async def update_me(
    payload: UserUpdate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    service: UserService = Depends(_get_service),
) -> UserOut:
    return await service.update_me(user_id, payload)


@router.get("/search", response_model=list[UserOut])
async def search_users(
    q: Annotated[str, Query(min_length=2, max_length=64)],
    service: UserService = Depends(_get_service),
    _: uuid.UUID = Depends(get_current_user_id),
) -> list[UserOut]:
    return await service.search(q)


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: uuid.UUID,
    service: UserService = Depends(_get_service),
    _: uuid.UUID = Depends(get_current_user_id),
) -> UserOut:
    return await service.get_by_id(user_id)
