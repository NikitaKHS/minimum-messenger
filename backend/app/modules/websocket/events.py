"""WebSocket event type constants."""

# Client → Server
CLIENT_TYPING_STARTED = "typing.started"
CLIENT_TYPING_STOPPED = "typing.stopped"
CLIENT_MESSAGE_DELIVERED = "message.delivered"
CLIENT_MESSAGE_READ = "message.read"
CLIENT_PRESENCE_UPDATE = "presence.update"

# Server → Client
SERVER_CONNECTED = "client.connected"
SERVER_MESSAGE_NEW = "message.new"
SERVER_MESSAGE_DELIVERED = "message.delivered"
SERVER_MESSAGE_READ = "message.read"
SERVER_MESSAGE_DELETED = "message.deleted"
SERVER_CHAT_CREATED = "chat.created"
SERVER_MEMBER_ADDED = "group.member_added"
SERVER_MEMBER_REMOVED = "group.member_removed"
SERVER_KEY_ROTATED = "group.key_rotated"
SERVER_TYPING_STARTED = "typing.started"
SERVER_TYPING_STOPPED = "typing.stopped"
SERVER_PRESENCE_UPDATED = "presence.updated"
SERVER_DEVICE_REVOKED = "device.revoked"
SERVER_KEY_CHANGED = "key.changed"
