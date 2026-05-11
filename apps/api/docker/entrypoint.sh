#!/bin/bash
# openclaw-entrypoint.sh — container start hook for the openclaw-aios image.
#
# Materialises per-instance config from env vars, then exec-replaces with
# supervisord (the CMD). Mirrors what install-claw.sh does at first boot
# on a VM, minus the apt/sshd/ufw work that the image already baked.
#
# Required env vars (Fly machine env or `docker run -e`):
#   SUBDOMAIN          — claw subdomain, e.g. cosmic-dune
#   DOMAIN             — top-level domain, e.g. myclaw.one
#   GATEWAY_TOKEN      — bearer for the openclaw gateway
#   CONFIG_JSON_B64    — base64-encoded openclaw.json
# Optional env vars:
#   OPENROUTER_API_KEY — built-in LLM key, exported into gateway environment
#   IE / IT / IR       — install-progress reporter (URL, token, run id)

set -eu

LOG=/var/log/openclaw-bootstrap.log
mkdir -p /var/log
exec > >(tee -a "$LOG") 2>&1
echo "=== openclaw-entrypoint starting at $(date -u) ==="

phase() {
    [ -z "${IE:-}" ] && return 0
    curl -fsS --max-time 10 -X POST "$IE" \
        -H "Authorization: Bearer ${IT:-}" \
        -H 'Content-Type: application/json' \
        -d "{\"phase\":\"$1\",\"runId\":\"${IR:-}\",\"logTail\":\"\"}" \
        >/dev/null 2>&1 || true
}

: "${SUBDOMAIN:?SUBDOMAIN is required}"
: "${DOMAIN:?DOMAIN is required}"
: "${GATEWAY_TOKEN:?GATEWAY_TOKEN is required}"
: "${CONFIG_JSON_B64:?CONFIG_JSON_B64 is required}"

phase mounting_storage

# /data is the volume mount point. Point ~/.openclaw at it so workspace
# files (MEMORY.md, agent state, user uploads) survive container restarts
# while the bulk of the image stays read-only.
DATA_DIR=/data
mkdir -p "$DATA_DIR/openclaw" "$DATA_DIR/studio"
chown -R openclaw:openclaw "$DATA_DIR/openclaw"

if [ ! -L /home/openclaw/.openclaw ]; then
    rm -rf /home/openclaw/.openclaw
    ln -s "$DATA_DIR/openclaw" /home/openclaw/.openclaw
fi

mkdir -p /home/openclaw/.openclaw/agents/main/agent
mkdir -p /home/openclaw/.openclaw/workspace/.openclaw

# Decode per-instance openclaw.json. Re-rendered every boot so config
# changes (skill installs, agent edits) flowing in via the API are
# authoritative.
echo "$CONFIG_JSON_B64" | base64 -d > /home/openclaw/.openclaw/openclaw.json

# First-boot only: seed agent personality from the image-baked seed dir
# into the persistent volume. Never overwrite — once the user has edited
# IDENTITY.md / SOUL.md / MEMORY.md, those become the source of truth.
seed_if_missing() {
    local src="$1"
    local dst="$2"
    [ -f "$dst" ] && return 0
    [ -f "$src" ] || return 0
    cp "$src" "$dst"
}

for f in IDENTITY.md AGENTS.md SOUL.md HEARTBEAT.md MEMORY.md; do
    seed_if_missing "/opt/openclaw-seed/$f" "/home/openclaw/.openclaw/agents/main/agent/$f"
    seed_if_missing "/opt/openclaw-seed/$f" "/home/openclaw/.openclaw/workspace/$f"
done

cat > /home/openclaw/.openclaw/workspace/.openclaw/workspace-state.json << 'WSTATE'
{
  "version": 1,
  "bootstrapSeededAt": "2026-04-01T00:00:00.000Z",
  "setupCompletedAt": "2026-04-01T00:00:00.000Z"
}
WSTATE

chown -R openclaw:openclaw /home/openclaw

phase calibrating_agents

# Studio settings — schema must match what server/studio-settings.js
# expects: nested { gateway: { url, token } }. The flat
# { gatewayUrl, gatewayToken } shape silently fell through to the
# "Configure gateway" modal on the VM path; same trap here if reshaped.
mkdir -p /root/.openclaw/openclaw-studio /home/openclaw/.openclaw/openclaw-studio
cat > /root/.openclaw/openclaw-studio/settings.json << SETTINGS
{
  "gateway": {
    "url": "ws://127.0.0.1:18789",
    "token": "${GATEWAY_TOKEN}"
  }
}
SETTINGS
cp /root/.openclaw/openclaw-studio/settings.json \
    /home/openclaw/.openclaw/openclaw-studio/settings.json
chown -R openclaw:openclaw /home/openclaw/.openclaw/openclaw-studio

phase wiring_network

# Render Caddyfile from the template — placeholders not env interpolation
# so the rendered file reads cleanly when you cat /etc/caddy/Caddyfile to
# debug a 502.
sed \
    -e "s|__SUBDOMAIN__|${SUBDOMAIN}|g" \
    -e "s|__DOMAIN__|${DOMAIN}|g" \
    -e "s|__GATEWAY_TOKEN__|${GATEWAY_TOKEN}|g" \
    /etc/caddy/Caddyfile.template > /etc/caddy/Caddyfile

# Build the supervisord env override for openclaw-gateway so the optional
# OPENROUTER_API_KEY flows in without leaking into the rest of the
# container's environment. Read by the gateway program block via
# environment= directive — we materialise it at runtime since
# supervisord.conf is baked.
mkdir -p /etc/supervisor/conf.d
{
    echo '[program:openclaw-gateway]'
    if [ -n "${OPENROUTER_API_KEY:-}" ]; then
        echo "environment=HOME=\"/home/openclaw\",NODE_ENV=\"production\",OPENROUTER_API_KEY=\"${OPENROUTER_API_KEY}\""
    else
        echo 'environment=HOME="/home/openclaw",NODE_ENV="production"'
    fi
} > /etc/supervisor/conf.d/openclaw-gateway-env.conf

phase issuing_certificate

# Caddy will issue the cert on first 80→443 redirect handshake. We don't
# block on it here — Studio + gateway can come up in parallel and the
# first chat request triggers ACME.

phase installing_studio

# Studio is already built into /openclaw-studio/.next at image build
# time, so no work to do here other than emitting the phase. The
# `installing_studio` row keeps the install-progress UI's checklist in
# sync with what the VM path emits.

# Hand off to supervisord (the CMD). All four programs (caddy, gateway,
# studio, node_exporter) start in parallel; their healthchecks are the
# first 200 from each. We fire `phase ready` on a small background
# watcher so the install progress page can flip the user to the studio
# the moment :3000 answers, instead of waiting for an arbitrary timeout.
(
    for i in $(seq 1 360); do
        if curl -sf -o /dev/null http://127.0.0.1:3000; then
            echo "[oc] studio answering after ${i}x 5s"
            phase ready
            exit 0
        fi
        sleep 5
    done
    echo "[oc] WARNING: studio did not bind :3000 within 30 min — firing phase ready anyway"
    phase ready
) &

echo "=== openclaw-entrypoint handing off to supervisord ==="
exec "$@"
