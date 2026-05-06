# Database Schema

PostgreSQL 16. All primary keys are UUID. All timestamps are `TIMESTAMPTZ`.

## `users`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| username | varchar(64) | unique, not null |
| email | varchar(255) | unique, nullable |
| password_hash | text | Argon2id hash |
| status | varchar(32) | active / banned |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| deleted_at | timestamptz | soft delete |

## `sessions`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | cascade delete |
| device_id | uuid FK → devices | cascade delete |
| refresh_token_hash | text | SHA-256 of raw token |
| user_agent | text | nullable |
| ip | inet | nullable |
| expires_at | timestamptz | |
| revoked_at | timestamptz | set on logout/rotation |
| created_at | timestamptz | |

## `devices`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | |
| device_name | varchar(128) | |
| device_type | varchar(32) | web / ios / android |
| platform | varchar(64) | nullable |
| public_identity_key | text | base64 SPKI |
| public_signed_prekey | text | nullable |
| signed_prekey_signature | text | nullable |
| public_key_fingerprint | varchar(128) | SHA-256 hex of public key |
| is_active | bool | false when revoked |
| last_seen_at | timestamptz | nullable |
| revoked_at | timestamptz | nullable |
| created_at | timestamptz | |

Unique constraint: `(user_id, public_key_fingerprint)`.

## `one_time_prekeys`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| device_id | uuid FK → devices | |
| key_id | integer | app-level key index |
| public_prekey | text | base64 |
| is_used | bool | set to true when claimed |
| used_at | timestamptz | nullable |
| created_at | timestamptz | |

Unique: `(device_id, key_id)`.

## `contacts`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| owner_user_id | uuid FK → users | |
| contact_user_id | uuid FK → users | |
| alias | varchar(128) | custom name, nullable |
| status | varchar(32) | active / deleted |
| created_at | timestamptz | |

Unique: `(owner_user_id, contact_user_id)`.

## `chats`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| type | varchar(32) | direct / group / system |
| title | varchar(255) | nullable (direct chats have none) |
| avatar_url | text | nullable |
| created_by | uuid FK → users | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| deleted_at | timestamptz | soft delete |

## `chat_members`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| chat_id | uuid FK → chats | cascade |
| user_id | uuid FK → users | cascade |
| role | varchar(32) | owner / admin / member |
| joined_at | timestamptz | |
| left_at | timestamptz | nullable — null means still member |
| muted_until | timestamptz | nullable |
| created_at | timestamptz | |

Unique: `(chat_id, user_id)`.

## `group_invites`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| chat_id | uuid FK → chats | |
| invited_user_id | uuid FK → users | |
| invited_by | uuid FK → users | |
| status | varchar(32) | pending / accepted / declined |
| created_at | timestamptz | |
| accepted_at | timestamptz | nullable |
| declined_at | timestamptz | nullable |

## `messages`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| chat_id | uuid FK → chats | cascade |
| sender_user_id | uuid FK → users | |
| sender_device_id | uuid FK → devices | |
| client_message_id | varchar(128) | idempotency key per device |
| encrypted_payload | text | **never plaintext** |
| encryption_version | varchar(32) | v1 |
| message_type | varchar(32) | text / attachment / system |
| created_at | timestamptz | |
| edited_at | timestamptz | nullable |
| deleted_at | timestamptz | nullable |

Unique: `(sender_device_id, client_message_id)`.  
Index: `(chat_id, created_at DESC)` — used for cursor pagination.

## `message_recipients`

Delivery status per recipient device.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| message_id | uuid FK → messages | cascade |
| recipient_user_id | uuid FK → users | cascade |
| recipient_device_id | uuid FK → devices | cascade |
| delivery_status | varchar(32) | pending / sent / delivered / read / failed |
| delivered_at | timestamptz | nullable |
| read_at | timestamptz | nullable |
| created_at | timestamptz | |

## `group_message_keys`

Encrypted group key per recipient device per message. Backend stores this but cannot decrypt it.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| chat_id | uuid FK → chats | |
| message_id | uuid FK → messages | nullable (key rotation events) |
| recipient_user_id | uuid FK → users | |
| recipient_device_id | uuid FK → devices | |
| encrypted_group_key | text | AES-wrapped, opaque to server |
| key_version | integer | which key epoch this belongs to |
| created_at | timestamptz | |

## `chat_key_versions`

Records every group key rotation event.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| chat_id | uuid FK → chats | |
| version | integer | monotonically increasing |
| created_by_device_id | uuid FK → devices | |
| reason | varchar(64) | group_created / member_added / member_removed / device_revoked / manual |
| created_at | timestamptz | |

Unique: `(chat_id, version)`.

## `attachments`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| message_id | uuid FK → messages | nullable until message is sent |
| storage_key | text | S3/MinIO object key |
| file_size | bigint | bytes |
| mime_type | varchar(128) | nullable |
| encrypted_file_key | text | file key, encrypted for recipient — **never plaintext** |
| checksum | text | SHA-256 of encrypted blob |
| upload_status | varchar(32) | pending / completed / failed |
| created_at | timestamptz | |

## `outbox_events`

Transactional outbox for reliable event delivery.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| event_type | varchar(128) | e.g. message.new |
| aggregate_type | varchar(64) | message / chat / etc. |
| aggregate_id | uuid | |
| payload | jsonb | event data |
| status | varchar(32) | pending / processed / failed |
| attempts | integer | retry counter |
| next_retry_at | timestamptz | nullable |
| created_at | timestamptz | |
| processed_at | timestamptz | nullable |

## `audit_logs`

Append-only security event log.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | nullable |
| device_id | uuid FK → devices | nullable |
| event_type | varchar(128) | user.registered, auth.login, device.revoked, etc. |
| ip | inet | nullable |
| user_agent | text | nullable |
| metadata | jsonb | nullable |
| created_at | timestamptz | |

## `idempotency_keys`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | |
| key | varchar(128) | client-provided idempotency key |
| request_hash | text | SHA-256 of request body |
| response_status | integer | cached response code |
| response_body | jsonb | cached response body |
| created_at | timestamptz | |
| expires_at | timestamptz | TTL, typically 24h |

Unique: `(user_id, key)`.

---

## Indexes summary

```sql
-- Sessions
idx_sessions_user_id
idx_sessions_expires_at
idx_sessions_token_hash (unique)

-- Devices
idx_devices_user_id
idx_devices_user_active (user_id, is_active)
idx_devices_fingerprint unique(user_id, public_key_fingerprint)

-- Prekeys
idx_prekeys_device_used (device_id, is_used)

-- Contacts
idx_contacts_owner, idx_contacts_contact

-- Chats / members
idx_chats_type
idx_chat_members_chat, idx_chat_members_user

-- Messages  ← most critical
idx_messages_chat_created (chat_id, created_at DESC)
idx_messages_sender_created

-- Recipients
idx_recipients_user_status
idx_recipients_device_status

-- Group keys
idx_group_keys_chat_version
idx_group_keys_device

-- Attachments
idx_attachments_message
idx_attachments_status

-- Outbox
idx_outbox_status_retry (status, next_retry_at)

-- Audit
idx_audit_user_created (user_id, created_at DESC)
```
