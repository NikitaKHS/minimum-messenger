"""Import all models here so Alembic can find them for autogenerate."""
from app.db.base import Base  # noqa: F401
from app.modules.users.models import User  # noqa: F401
from app.modules.auth.models import Session  # noqa: F401
from app.modules.devices.models import Device  # noqa: F401
from app.modules.keys.models import OneTimePrekey  # noqa: F401
from app.modules.contacts.models import Contact  # noqa: F401
from app.modules.chats.models import Chat, ChatMember, GroupInvite  # noqa: F401
from app.modules.messages.models import (  # noqa: F401
    Message,
    MessageRecipient,
    GroupMessageKey,
    ChatKeyVersion,
)
from app.modules.attachments.models import Attachment  # noqa: F401
from app.modules.audit.models import AuditLog  # noqa: F401
from app.modules.workers.models import OutboxEvent  # noqa: F401
from app.shared.models import IdempotencyKey  # noqa: F401
