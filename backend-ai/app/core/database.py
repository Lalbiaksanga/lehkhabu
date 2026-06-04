"""
Async SQLAlchemy engine and session factory for backend-ai.
Connects to the same PostgreSQL database as backend-api.

The lehkhabu schema is set via connect_args so that ForeignKeys
referencing tables like 'books' resolve correctly inside the
lehkhabu schema namespace used by the main backend.
"""
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings


# Create async engine — asyncpg driver for non-blocking DB access
# search_path includes lehkhabu (app tables) and public (pgvector extension)
engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    connect_args={
        "server_settings": {"search_path": "lehkhabu,public"}
    },
)

# Session factory — each request gets its own session
async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models in backend-ai."""
    pass


async def get_db() -> AsyncSession:
    """
    FastAPI dependency that yields a database session.
    Usage in routes:
        async def route(db: AsyncSession = Depends(get_db)):
    """
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
