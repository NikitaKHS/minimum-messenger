"""WebSocket event type constants."""

# Client → Server
CLIENT_TYPING_STARTED = "typing.started"
CLIENT_TYPING_STOPPED = "typing.stopped"
CLIENT_MESSAGE_DELIVERED = "message.delivered"
CLIENT_MESSAGE_READ = "message.read"
CLIENT_PRESENCE_UPDATE = "presence.update"

# Call signaling (Client → Server, relayed to peer)
CLIENT_CALL_INVITE = "call.invite"
CLIENT_CALL_ACCEPT = "call.accept"
CLIENT_CALL_DECLINE = "call.decline"
CLIENT_CALL_END = "call.end"
CLIENT_CALL_OFFER = "call.offer"
CLIENT_CALL_ANSWER = "call.answer"
CLIENT_CALL_ICE = "call.ice"

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

# Call signaling (Server → Client)
SERVER_CALL_INVITE = "call.invite"
SERVER_CALL_ACCEPT = "call.accept"
SERVER_CALL_DECLINE = "call.decline"
SERVER_CALL_END = "call.end"
SERVER_CALL_OFFER = "call.offer"
SERVER_CALL_ANSWER = "call.answer"
SERVER_CALL_ICE = "call.ice"
