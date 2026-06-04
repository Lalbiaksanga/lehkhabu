"""
Celery configuration using SQLAlchemy transport (PostgreSQL as broker).

The key difference from Redis-backed Celery:
  broker = "db+postgresql://..." instead of "redis://..."

Celery auto-creates celery_taskmeta and celery_tasksetmeta tables.
No Redis needed — PostgreSQL handles message passing.
"""
from celery import Celery
from app.core.config import settings

# Use the explicit URLs from .env; fall back to deriving from DATABASE_URL
# if the .env variables aren't set (e.g., in older deployments).
_fallback = settings.database_url.replace("+asyncpg", "").replace(
    "postgresql://", "db+postgresql://"
)
broker_url = settings.celery_broker_url or _fallback
result_url = settings.celery_result_backend or _fallback

celery_app = Celery(
    "lehkhabu",
    broker=broker_url,
    backend=result_url,
    include=["app.worker.book_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Kolkata",
    enable_utc=True,
    # Important: SQLAlchemy transport settings
    database_engine_options={"echo": False},
    result_expires=3600,  # clean up task results after 1 hour
    # Periodic task to clean up expired cache rows
    beat_schedule={
        "cleanup-ai-cache": {
            "task": "app.worker.book_tasks.cleanup_expired_cache",
            "schedule": 3600.0,  # run every hour
        },
    },
)
