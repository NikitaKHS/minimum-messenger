from prometheus_client import Counter, Gauge

messages_sent_total = Counter(
    "minimum_messages_sent_total",
    "Total messages sent",
    ["chat_type"],
)

ws_active_connections = Gauge(
    "minimum_ws_active_connections",
    "Current active WebSocket connections",
)

auth_attempts_total = Counter(
    "minimum_auth_attempts_total",
    "Authentication attempts by event type",
    ["event"],
)
