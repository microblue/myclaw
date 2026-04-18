#!/usr/bin/env bash
# Usage: bash scripts/rollback.sh <sha-or-tag>
# Runs on the Lightsail production server. Hard-resets to the given ref,
# reinstalls, rebuilds web, restarts api, health-checks.

set -euo pipefail

cd "$(dirname "$0")/.."

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
    echo "usage: $0 <sha-or-tag>"
    echo ""
    echo "recent commits on main:"
    git log --oneline -20 origin/main 2>/dev/null || git log --oneline -20
    exit 2
fi

START=$(date +%s)
CURRENT=$(git rev-parse --short HEAD)

echo "==> current: $CURRENT"
echo "==> target:  $TARGET"
read -r -p "    roll back to $TARGET? [y/N] " confirm
[[ "$confirm" == "y" || "$confirm" == "Y" ]] || { echo "aborted"; exit 1; }

echo "==> fetch"
git fetch --prune origin

echo "==> reset to $TARGET"
git reset --hard "$TARGET"
RESET_SHA=$(git rev-parse --short HEAD)

echo "==> install deps"
pnpm install --frozen-lockfile

echo "==> rebuild web"
pnpm --filter web build

echo "==> restart api"
sudo systemctl restart myclaw-api

echo "==> health check"
for i in {1..20}; do
    if systemctl is-active --quiet myclaw-api && (exec 3<>/dev/tcp/127.0.0.1/2222) 2>/dev/null; then
        exec 3<&- 3>&-
        echo "    api up after ${i}s"
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

echo "==> rolled back in $(( $(date +%s) - START ))s: $CURRENT -> $RESET_SHA"
