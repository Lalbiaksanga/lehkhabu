#!/usr/bin/env python3
"""
migrate.py — Lehkhabu database migration helper

Usage (from backend-api/ directory):
    python migrate.py status       # Show pending migrations
    python migrate.py run          # Apply all pending migrations (psql)
    python migrate.py new <name>   # Generate a new alembic migration
    python migrate.py upgrade      # Run alembic upgrade head
"""

import os
import sys
import subprocess
from pathlib import Path

MIGRATIONS_DIR = Path(__file__).parent / "migrations"
ENV_FILE = Path(__file__).parent.parent / ".env"


def load_env():
    """Load environment variables from root .env file."""
    if not ENV_FILE.exists():
        print(f"❌ .env file not found at {ENV_FILE}")
        sys.exit(1)
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


def get_db_url():
    """Get the sync PostgreSQL connection URL."""
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        print("❌ DATABASE_URL not set in .env")
        sys.exit(1)
    # Strip asyncpg driver for psql/psycopg2 compatibility
    return url.replace("postgresql+asyncpg://", "postgresql://")


def cmd_status():
    """List all migration files and their status."""
    migrations = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not migrations:
        print("No migration files found in migrations/")
        return
    print(f"\n{'─'*60}")
    print(f"  Lehkhabu — Migration Files  ({len(migrations)} total)")
    print(f"{'─'*60}")
    for m in migrations:
        print(f"  📄 {m.name}")
    print(f"{'─'*60}\n")
    print("To apply via psql:")
    print("  python migrate.py run\n")


def cmd_run():
    """Apply all migrations in order via psql."""
    load_env()
    db_url = get_db_url()
    migrations = sorted(MIGRATIONS_DIR.glob("*.sql"))
    seed = [m for m in migrations if "seed" in m.name.lower()]
    non_seed = [m for m in migrations if "seed" not in m.name.lower()]

    print(f"\n🚀 Applying {len(non_seed)} schema migrations...\n")
    for mig in non_seed:
        print(f"  → {mig.name}")
        result = subprocess.run(
            ["psql", db_url, "-f", str(mig)],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            print(f"  ❌ Failed: {result.stderr}")
            sys.exit(1)
        print(f"  ✅ Done")

    if seed:
        answer = input(f"\n⚠️  Apply seed data migration? (dev only) [y/N]: ").strip().lower()
        if answer == "y":
            for mig in seed:
                print(f"  → {mig.name}")
                result = subprocess.run(
                    ["psql", db_url, "-f", str(mig)],
                    capture_output=True, text=True
                )
                if result.returncode != 0:
                    print(f"  ❌ Failed: {result.stderr}")
                    sys.exit(1)
                print(f"  ✅ Done")

    print("\n✨ All migrations applied successfully!\n")


def cmd_new(name: str):
    """Generate a new Alembic migration from model changes."""
    result = subprocess.run(
        ["alembic", "revision", "--autogenerate", "-m", name],
        cwd=Path(__file__).parent
    )
    if result.returncode == 0:
        print(f"\n✅ Migration '{name}' created in alembic/versions/")
        print("   Review it, then run: alembic upgrade head\n")


def cmd_upgrade():
    """Apply all Alembic migrations."""
    subprocess.run(
        ["alembic", "upgrade", "head"],
        cwd=Path(__file__).parent
    )


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return

    command = args[0]
    if command == "status":
        cmd_status()
    elif command == "run":
        cmd_run()
    elif command == "new" and len(args) >= 2:
        cmd_new("_".join(args[1:]))
    elif command == "upgrade":
        cmd_upgrade()
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
