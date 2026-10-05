#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
docker compose up --build --detach
echo "Prelegal is running at http://localhost:8000"
