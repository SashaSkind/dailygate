#!/bin/bash
# Start DailyGate data API on port 8001
# Usage: ./start.sh [--reset]
cd "$(dirname "$0")"
if [[ "$1" == "--reset" ]]; then
  echo "Resetting database..."
  rm -f dailygate.db
fi
python3 -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
