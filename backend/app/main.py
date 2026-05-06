import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.logging import configure_logging
from app.core.rate_limit import limiter, rate_limit_exceeded_handler
from app.core.redis import close_redis, get_redis
from app.modules.admin.router import router as admin_router
from app.modules.attachments.router import router as attachments_router
from app.modules.auth.router import router as auth_router
from app.modules.chats.router import router as chats_router
from app.modules.contacts.router import router as contacts_router
from app.modules.devices.router import router as devices_router
from app.modules.keys.router import router as keys_router
from app.modules.messages.router import router as messages_router
from app.modules.users.router import router as users_router
from app.modules.websocket.router import router as ws_router

configure_logging(settings.ENVIRONMENT)

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Prometheus metrics
Instrumentator().instrument(app).expose(app, endpoint="/metrics")

# Routers
app.include_router(auth_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(devices_router, prefix="/api/v1")
app.include_router(keys_router, prefix="/api/v1")
app.include_router(contacts_router, prefix="/api/v1")
app.include_router(chats_router, prefix="/api/v1")
app.include_router(messages_router, prefix="/api/v1")
app.include_router(attachments_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(ws_router)


@app.on_event("startup")
async def startup() -> None:
    redis = await get_redis()

    from app.modules.websocket.manager import redis_subscriber

    asyncio.create_task(redis_subscriber(redis))

    from app.db.session import AsyncSessionFactory
    from app.modules.workers.outbox import OutboxWorker

    worker = OutboxWorker(AsyncSessionFactory, redis)
    asyncio.create_task(worker.run())


@app.on_event("shutdown")
async def shutdown() -> None:
    await close_redis()


@app.get("/health", tags=["health"])
async def health() -> dict:
    return {"status": "ok", "version": settings.APP_VERSION}
