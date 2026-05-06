# Minimum

A self-hosted messenger built on the principle that the server shouldn't need to trust anyone — including itself.

All message content is encrypted on the client before it hits the network. The backend stores encrypted blobs, routes them, and tracks delivery statuses. That's it. Even if someone compromises the database or the server itself, they get ciphertext.

> This is a personal project. The goal was to build something production-grade enough to actually use, while keeping the codebase small and readable.

---

## Why build this

Most "secure" messengers are either closed-source, cloud-only, or require trusting a third-party company. Running your own instance of something like Signal isn't really an option. I wanted a messenger where:

- I control the infrastructure
- Messages are encrypted client-side, always
- The server is essentially a dumb relay with delivery guarantees
- The codebase fits in one developer's head

---

## How it works

### Encryption model

Each device generates an identity key pair locally at registration. The private key **never leaves the device** — it lives in IndexedDB, not on the server.

For direct messages, sender and recipient derive a shared secret via ECDH + HKDF, then encrypt with AES-GCM-256. For group chats, the sender generates a group key and encrypts it separately for each active device of each member.

The server sees only:
- `encrypted_payload` — an opaque base64 blob
- `encrypted_group_key` — the group key, wrapped per-device
- Delivery status, timestamps, metadata

The architecture is designed to evolve toward a proper Signal-like protocol (signed prekeys, one-time prekeys, double ratchet) without requiring a rewrite.

### Realtime delivery

WebSocket connections authenticate via short-lived JWT tokens (15 min TTL). For multi-instance deployments, events are relayed through Redis pub/sub — each user's events go to `ws:user:{uuid}` and get fanned out to all their connected devices.

Delivery reliability is handled via an outbox pattern: events are written to `outbox_events` in the same database transaction as the message, then a background worker publishes them to Redis with retries.

### Multi-device

A user can have multiple devices, each with its own identity key. Group message keys and encrypted payloads are stored per recipient device. Revoking a device triggers a group key rotation — the revoked device stops receiving new messages it can decrypt.

---

## Stack

- **Backend** — FastAPI, SQLAlchemy 2.0 (async), PostgreSQL 16, Redis 7
- **Auth** — JWT (access + refresh rotation), Argon2id for passwords
- **Storage** — MinIO / any S3-compatible service for encrypted attachments
- **Frontend** — React 18 + TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Zustand
- **Crypto** — Web Crypto API (ECDH P-256, AES-GCM-256, HKDF-SHA-256)
- **Deploy** — Docker Compose, Nginx

---

## Getting started

```bash
git clone <this-repo>
cd Minimum

cp backend/.env.example backend/.env
# Edit backend/.env — at minimum change SECRET_KEY and ADMIN_SECRET_KEY

docker-compose up -d

# Wait for postgres to be healthy, then run migrations
docker-compose exec backend alembic upgrade head
```

Frontend: http://localhost:3000  
API (dev mode): http://localhost:8000/docs  
MinIO console: http://localhost:9001

For local development without Docker:

```bash
# Backend
cd backend
pip install -e ".[dev]"
cp .env.example .env
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

---

## Project structure

```
backend/
  app/
    core/          settings, JWT/password utils, logging, rate limiter
    db/            async SQLAlchemy engine, session factory, model imports
    modules/
      auth/        register, login, refresh, logout
      users/       profile, search
      devices/     multi-device management, public key storage
      keys/        key bundles, one-time prekeys, fingerprints
      contacts/    contact list
      chats/       direct + group chat creation, membership
      messages/    send/receive encrypted messages, delivery status
      attachments/ encrypted file upload via presigned S3 URLs
      websocket/   WS endpoint, Redis pub/sub relay, typing/presence
      admin/       user management without plaintext access
      audit/       security event log
      workers/     outbox event processor
    shared/        DI dependencies, pagination, utils
    tests/

frontend/
  src/
    shared/
      api/         axios client with JWT refresh interceptor, WS client
      crypto/      E2EE primitives (key gen, ECDH, AES-GCM, group keys)
      store/       Zustand auth store (refresh token persisted, access token in memory)
    entities/      TypeScript types for user, chat, message
    features/      auth forms, message composer
    pages/         login, register, chats, settings, devices
```

Each backend module follows the same pattern: `models.py → repository.py → service.py → router.py → schemas.py`. Services contain business logic, repositories handle data access, routers only do HTTP serialization and dependency injection.

---

## API overview

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout

GET    /api/v1/users/me
PATCH  /api/v1/users/me
GET    /api/v1/users/search
GET    /api/v1/users/{id}

POST   /api/v1/devices
GET    /api/v1/devices
DELETE /api/v1/devices/{id}

GET    /api/v1/keys/users/{user_id}/devices
POST   /api/v1/keys/prekeys
GET    /api/v1/keys/fingerprint/{device_id}

POST   /api/v1/chats/direct
POST   /api/v1/chats/group
GET    /api/v1/chats
GET    /api/v1/chats/{id}/members
POST   /api/v1/chats/{id}/members
DELETE /api/v1/chats/{id}/members/{user_id}
POST   /api/v1/chats/{id}/leave

POST   /api/v1/messages
GET    /api/v1/chats/{id}/messages   (cursor pagination)
POST   /api/v1/messages/{id}/delivered
POST   /api/v1/messages/{id}/read

POST   /api/v1/attachments/init
POST   /api/v1/attachments/complete
GET    /api/v1/attachments/{id}/download-url

GET    /ws?token=<access_token>
```

WebSocket events are documented in [docs/WEBSOCKET.md](docs/WEBSOCKET.md).

---

## Database schema

16 tables. Source of truth for everything. No plaintext message content, no raw refresh tokens, no private keys.

Key tables: `users`, `sessions` (refresh token hash only), `devices` (public keys), `one_time_prekeys`, `chats`, `chat_members`, `messages` (encrypted_payload only), `message_recipients` (delivery status per device), `group_message_keys` (encrypted per device), `chat_key_versions`, `attachments`, `outbox_events`, `audit_logs`.

Full schema with indexes: [docs/SCHEMA.md](docs/SCHEMA.md).

---

## Security notes

Passwords are hashed with Argon2id (time=2, memory=64MB). Refresh tokens are stored as SHA-256 hashes and rotated on every use — using a token twice returns 401. Access tokens are 15 minutes.

Rate limits: 5 req/min on register, 10 req/min on login. The admin API is protected by a separate secret header and has zero access to message content.

Audit log captures: registration, login (success/fail), logout, device registration/revocation, ban.

Nothing in the logs or database should ever contain: plaintext messages, private keys, raw tokens, decrypted file content.

---

## Running tests

```bash
cd backend
# Requires a running postgres instance (see docker-compose)
pytest app/tests/ -v --cov=app
```

---

## Environment variables

See `backend/.env.example` for the full list. Required ones:

```
SECRET_KEY          — random 64-char string, used for JWT signing
DATABASE_URL        — postgres connection string
REDIS_URL           — redis connection string
S3_*                — MinIO or any S3-compatible storage credentials
ADMIN_SECRET_KEY    — header secret for admin API
```

---

## Roadmap

- [ ] Signal-like double ratchet for forward secrecy
- [ ] Safety numbers / key verification UI
- [ ] Push notifications (web push + optional APNS/FCM)
- [ ] Voice/video (WebRTC, probably a separate service)
- [ ] Mobile app (React Native, sharing the crypto layer)
- [ ] Traefik + separate stage/prod environments
- [ ] Prometheus + Grafana dashboards

---

## License

MIT
