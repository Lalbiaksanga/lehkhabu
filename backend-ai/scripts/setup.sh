#!/usr/bin/env bash
# One-time / repeat setup for backend-ai (macOS Homebrew Python 3.12)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PYTHON="${PYTHON:-}"
for candidate in /opt/homebrew/bin/python3.12 /usr/local/bin/python3.12 python3.12; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PYTHON="$candidate"
    break
  fi
done

if [[ -z "$PYTHON" ]]; then
  echo "Python 3.12 not found. Install with: brew install python@3.12"
  exit 1
fi

echo "Using: $("$PYTHON" --version) at $PYTHON"
"$PYTHON" -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install psycopg2-binary

echo ""
echo "Next steps:"
echo "  source .venv/bin/activate"
echo "  alembic upgrade head    # requires PostgreSQL running"
echo "  uvicorn main:app --reload --port 8001"
