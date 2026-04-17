#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> git pull"
git fetch --prune origin
git reset --hard origin/main

echo "==> pnpm install"
corepack enable
pnpm install --frozen-lockfile

echo "==> build web"
pnpm --filter web build

echo "==> restart api"
sudo systemctl restart myclaw-api

echo "==> reload nginx (if config changed on disk it will pick up dist/ immediately)"
sudo systemctl reload nginx || true

echo "==> done"
