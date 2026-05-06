import hashlib
import uuid


def make_idempotency_key(*parts: str) -> str:
    return hashlib.sha256(":".join(parts).encode()).hexdigest()


def short_id() -> str:
    return uuid.uuid4().hex[:12]
