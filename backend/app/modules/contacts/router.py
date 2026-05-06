import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.contacts.schemas import ContactCreate, ContactOut
from app.modules.contacts.service import ContactService
from app.shared.dependencies import get_current_user_id

router = APIRouter(prefix="/contacts", tags=["contacts"])


def _get_service(db: AsyncSession = Depends(get_db)) -> ContactService:
    return ContactService(db)


@router.post("", response_model=ContactOut, status_code=201)
async def add_contact(
    payload: ContactCreate,
    service: ContactService = Depends(_get_service),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> ContactOut:
    return await service.add(user_id, payload)


@router.get("", response_model=list[ContactOut])
async def list_contacts(
    service: ContactService = Depends(_get_service),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> list[ContactOut]:
    return await service.list_contacts(user_id)


@router.delete("/{contact_id}", status_code=204)
async def delete_contact(
    contact_id: uuid.UUID,
    service: ContactService = Depends(_get_service),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> None:
    await service.delete(user_id, contact_id)
