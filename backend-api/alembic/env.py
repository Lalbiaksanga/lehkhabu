"""
Alembic environment configuration for Lehkhabu.

Uses synchronous psycopg2 for Alembic migrations (required by Alembic),
while the FastAPI app uses asyncpg at runtime.
"""
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

from app.core.config import settings
from app.core.database import Base

# Import all models so Alembic can detect them for autogenerate
from app.models import *  # noqa: F401, F403

# ── Alembic Config object ────────────────────────────────────────────────
config = context.config

# Override the sqlalchemy.url from settings (reads from ../.env)
# Use SYNC URL (psycopg2) — Alembic does NOT support async drivers
config.set_main_option("sqlalchemy.url", settings.SYNC_DATABASE_URL)

# Set up Python logging from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Target metadata for autogenerate
target_metadata = Base.metadata


# ── Offline mode ─────────────────────────────────────────────────────────
def run_migrations_offline() -> None:
    """
    Run migrations without a live DB connection.
    Useful for generating SQL scripts.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # Include schema-level objects (e.g. types, extensions)
        include_schemas=True,
    )
    with context.begin_transaction():
        context.run_migrations()


# ── Online mode ──────────────────────────────────────────────────────────
def run_migrations_online() -> None:
    """
    Run migrations with a live synchronous DB connection (psycopg2).
    Alembic requires a sync driver — asyncpg is used only by FastAPI.
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_schemas=True,
            # Render 'AS' in server-default for better diffs
            render_as_batch=False,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
