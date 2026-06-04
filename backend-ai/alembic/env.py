import sys
from os.path import abspath, dirname

# Ensure the project root is on sys.path so app.* imports work
sys.path.insert(0, abspath(dirname(dirname(__file__))))

from logging.config import fileConfig

from sqlalchemy import engine_from_config, text
from sqlalchemy import pool

from alembic import context

# Import Base and all models so autogenerate can detect the schema
from app.core.database import Base
from app.models.chunk import BookChunk, BookSummary, AICache  # noqa: F401

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Dynamic database URL override from .env
from app.core.config import settings
db_url = settings.database_url
if db_url.startswith("postgresql+asyncpg://"):
    db_url = db_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
config.set_main_option("sqlalchemy.url", db_url)

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Point autogenerate at our models
target_metadata = Base.metadata

# Only manage the AI tables — don't touch tables owned by schema.sql (books, users, etc.)
# Autogenerate will only create/modify tables that are defined in our models.
AI_TABLES = {"book_chunks", "book_summaries", "ai_cache"}


def include_object(object, name, type_, reflected, compare_to):
    """Only autogenerate migrations for AI-owned tables."""
    if type_ == "table":
        return name in AI_TABLES
    return True


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
