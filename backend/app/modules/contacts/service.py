import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.modules.contacts.models import Contact
from app.modules.contacts.schemas import ContactCreate, ContactOut


class ContactService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def add(self, owner_id: uuid.UUID, payload: ContactCreate) -> ContactOut:
        existing = await self._db.scalar(
            select(Contact).where(
                Contact.owner_user_id == owner_id,
                Contact.contact_user_id == payload.contact_user_id,
            )
        )
        if existing:
            raise ConflictError("Contact already exists")

        contact = Contact(
            id=uuid.uuid4(),
            owner_user_id=owner_id,
            contact_user_id=payload.contact_user_id,
            alias=payload.alias,
            status="active",
        )
        self._db.add(contact)
        await self._db.flush()
        return ContactOut.model_validate(contact)

    async def list_contacts(self, owner_id: uuid.UUID) -> list[ContactOut]:
        result = await self._db.scalars(
            select(Contact).where(
                Contact.owner_user_id == owner_id,
                Contact.status == "active",
            )
        )
        return [ContactOut.model_validate(c) for c in result]

    async def delete(self, owner_id: uuid.UUID, contact_id: uuid.UUID) -> None:
        contact = await self._db.scalar(
            select(Contact).where(Contact.id == contact_id)
        )
        if not contact:
            raise NotFoundError()
        if contact.owner_user_id != owner_id:
            raise ForbiddenError()
        contact.status = "deleted"
        await self._db.flush()
