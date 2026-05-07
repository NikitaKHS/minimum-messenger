# WebSocket Protocol

## Connection

```
GET /ws?token=<access_token>
```

Authenticate with a valid access token as a query parameter. The connection is rejected with code `4001` if the token is missing or expired.

On successful connection the server sends:

```json
{
  "type": "client.connected",
  "payload": {
    "user_id": "uuid",
    "device_id": "uuid"
  }
}
```

---

## Message format

All frames are JSON:

```json
{
  "type": "event.name",
  "payload": { ... }
}
```

---

## Client → Server events

### `typing.started`

```json
{
  "type": "typing.started",
  "payload": { "chat_id": "uuid" }
}
```

### `typing.stopped`

```json
{
  "type": "typing.stopped",
  "payload": { "chat_id": "uuid" }
}
```

### `presence.update`

Sent to refresh presence TTL (60 seconds). No payload needed.

```json
{
  "type": "presence.update",
  "payload": {}
}
```

---

## Server → Client events

### `message.new`

```json
{
  "type": "message.new",
  "payload": {
    "message_id": "uuid",
    "chat_id": "uuid",
    "chat_type": "direct | group",
    "sender_user_id": "uuid",
    "sender_device_id": "uuid",
    "sender_username": "alice",
    "encrypted_payload": "base64...",
    "encryption_version": "v1",
    "key_version": 3,
    "created_at": "2026-05-06T12:00:00Z"
  }
}
```

The client is responsible for decrypting `encrypted_payload` using its locally stored private key.

**Client responsibilities on receiving `message.new`:**
1. Acknowledge delivery — `POST /messages/{message_id}/delivered`
2. If the chat is open and the tab is visible — additionally `POST /messages/{message_id}/read`
3. Otherwise — increment the local unread counter and show a browser notification

### `message.delivered`

```json
{
  "type": "message.delivered",
  "payload": {
    "message_id": "uuid",
    "device_id": "uuid",
    "delivered_at": "2026-05-06T12:00:01Z"
  }
}
```

### `message.read`

```json
{
  "type": "message.read",
  "payload": {
    "message_id": "uuid",
    "device_id": "uuid",
    "read_at": "2026-05-06T12:00:05Z"
  }
}
```

### `message.deleted`

```json
{
  "type": "message.deleted",
  "payload": {
    "message_id": "uuid",
    "chat_id": "uuid"
  }
}
```

### `chat.created`

```json
{
  "type": "chat.created",
  "payload": {
    "chat_id": "uuid",
    "type": "direct | group"
  }
}
```

### `group.member_added`

```json
{
  "type": "group.member_added",
  "payload": {
    "chat_id": "uuid",
    "user_id": "uuid"
  }
}
```

### `group.member_removed`

```json
{
  "type": "group.member_removed",
  "payload": {
    "chat_id": "uuid",
    "user_id": "uuid"
  }
}
```

### `group.key_rotated`

Signals that a new group key version has been published. The client should fetch fresh encrypted group keys for the new version.

```json
{
  "type": "group.key_rotated",
  "payload": {
    "chat_id": "uuid",
    "key_version": 4,
    "reason": "member_removed"
  }
}
```

### `typing.started` / `typing.stopped`

```json
{
  "type": "typing.started",
  "payload": {
    "chat_id": "uuid",
    "user_id": "uuid"
  }
}
```

### `presence.updated`

```json
{
  "type": "presence.updated",
  "payload": {
    "user_id": "uuid",
    "status": "online | offline"
  }
}
```

### `device.revoked`

```json
{
  "type": "device.revoked",
  "payload": {
    "device_id": "uuid",
    "user_id": "uuid"
  }
}
```

### `key.changed`

Sent when a contact's device public key changes. The client should warn the user before continuing the conversation.

```json
{
  "type": "key.changed",
  "payload": {
    "user_id": "uuid",
    "device_id": "uuid",
    "old_fingerprint": "hex...",
    "new_fingerprint": "hex..."
  }
}
```

---

## Reconnection

The frontend client performs exponential backoff reconnection starting at 1 second, capped at 30 seconds. On reconnect, call `GET /api/v1/chats/{id}/messages?before=<last_seen_id>` to sync missed messages.

---

## Client-side UX state

The following state is tracked on the client only (not persisted to the server):

| State | Source | Cleared when |
|---|---|---|
| Unread count per chat | `message.new` event | Chat opened |
| Typing users per chat | `typing.started` / `typing.stopped` | `typing.stopped` or 7 s timeout |
| Online status per user | `presence.updated` | Next `presence.updated` |
| Delivery status per message | `message.delivered` / `message.read` | Page reload |
| Last message preview | `message.new` event | Page reload |

### Typing indicator

The client sends `typing.started` on the first keystroke and `typing.stopped` when the input is cleared or 3 seconds elapse without input. The server fan-outs both events to all other members.

Received `typing.started` events are auto-expired on the client after 7 seconds as a safety net in case `typing.stopped` is lost.

### Browser notifications

A browser notification is shown when `message.new` arrives, the sender is not the current user, and `document.visibilityState !== "visible"`. Notifications are grouped per chat via the `tag` field so rapid messages collapse into one.
