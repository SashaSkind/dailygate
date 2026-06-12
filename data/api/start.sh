#!/bin/bash
# Start DailyGate data + trust API on port 8001
#
# Usage:
#   ./start.sh              — start (seed on first run)
#   ./start.sh --reset      — wipe DB, reseed, repush Langfuse history
#
# Langfuse (optional — set these for observability + prize demo):
#   export LANGFUSE_PUBLIC_KEY=pk-lf-...
#   export LANGFUSE_SECRET_KEY=sk-lf-...
#   export LANGFUSE_HOST=https://cloud.langfuse.com   # or self-hosted
#
# Without Langfuse keys the API works exactly the same — tracing is a no-op.

cd "$(dirname "$0")"

# Load .env if present (never committed — put your keys there)
if [[ -f .env ]]; then
  set -a && source .env && set +a
fi

if [[ "$1" == "--reset" ]]; then
  echo "Resetting database..."
  rm -f dailygate.db dailygate.db-shm dailygate.db-wal
fi

if [[ -n "$LANGFUSE_PUBLIC_KEY" ]]; then
  echo "Langfuse: enabled (host=${LANGFUSE_HOST:-https://cloud.langfuse.com})"
else
  echo "Langfuse: not configured (set LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY to enable)"
fi

pip install -q -r requirements.txt
python3 -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
