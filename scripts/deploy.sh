#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

START=$(date +%s)
trap 'echo "==> FAILED after $(( $(date +%s) - START ))s (sha $(git rev-parse --short HEAD 2>/dev/null || echo ?))"' ERR

echo "==> pull latest"
# --tags so the web build's `git describe --tags` sees the latest
# release tag (footer + /whats-new were stuck on v1.4 after v1.5
# was tagged because plain --prune didn't fetch new tags).
git fetch --prune --tags origin
git reset --hard origin/main
SHA=$(git rev-parse --short HEAD)
echo "    at $SHA"

echo "==> install deps"
pnpm install --frozen-lockfile

echo "==> build web"
pnpm --filter web build

echo "==> restart api"
sudo systemctl restart myclaw-api

echo "==> health check"
for i in {1..20}; do
    if systemctl is-active --quiet myclaw-api && (exec 3<>/dev/tcp/127.0.0.1/2222) 2>/dev/null; then
        exec 3<&- 3>&-
        echo "    api up after ${i}x"
        break
    fi
    if [[ $i -eq 20 ]]; then
        echo "    api did NOT come up — dumping journal"
        sudo journalctl -u myclaw-api -n 50 --no-pager
        exit 1
    fi
    sleep 1
done

echo "==> reload nginx"
sudo systemctl reload nginx || true

echo "==> done in $(( $(date +%s) - START ))s @ $SHA"
