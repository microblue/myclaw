#!/bin/bash
# entrypoint.sh — Boot the AI-OS inside the openclaw-aios container.
#
# Equivalent of install-claw.sh's runtime portion: we already have
# openclaw + caddy + chromium installed in the image, so this only
# does the per-instance config render + service start. Per-instance
# config is the same env-var contract install-claw.sh expects, so the
# wrapper that generateCloudInit emits works unchanged.
#
# Required env (set by Fly app config or `docker run -e ...`):
#   ROOT_PASSWORD      — root login (kept for `flyctl ssh` parity)
#   SUBDOMAIN          — e.g. cosmic-dune
#   DOMAIN             — e.g. myclaw.one
#   GATEWAY_TOKEN      — inbound gateway bearer
#   CONFIG_JSON_B64    — base64'd openclaw.json
# Optional:
#   OPENROUTER_API_KEY — built-in LLM bearer
#   IE / IT / IR       — install-progress reporter (claws_install_phases)

set -eu

: "${ROOT_PASSWORD:?ROOT_PASSWORD required}"
: "${SUBDOMAIN:?SUBDOMAIN required}"
: "${DOMAIN:?DOMAIN required}"
: "${GATEWAY_TOKEN:?GATEWAY_TOKEN required}"
: "${CONFIG_JSON_B64:?CONFIG_JSON_B64 required}"

FULL_DOMAIN="${SUBDOMAIN}.${DOMAIN}"

phase() {
    [ -z "${IE:-}" ] && return 0
    curl -fsS --max-time 10 -X POST "$IE" -H "Authorization: Bearer $IT" -H 'Content-Type: application/json' -d "{\"phase\":\"$1\",\"runId\":\"$IR\",\"logTail\":\"\"}" >/dev/null 2>&1 || true
}
trap 'rc=$?; [ $rc -ne 0 ] && phase failed' EXIT

# Containers don't go through the renting_compute / mounting_storage
# / installing_kernel stages — those only apply to the VM path. Skip
# straight to the application-bring-up phases so the install page
# animation makes sense.
phase calibrating_agents

mkdir -p /home/openclaw/.openclaw/agents/main/agent
echo "$CONFIG_JSON_B64" | base64 -d > /home/openclaw/.openclaw/openclaw.json

mkdir -p /home/openclaw/.openclaw/workspace/.openclaw
cat > /home/openclaw/.openclaw/workspace/.openclaw/workspace-state.json << 'WSTATE'
{
  "version": 1,
  "bootstrapSeededAt": "2026-04-01T00:00:00.000Z",
  "setupCompletedAt": "2026-04-01T00:00:00.000Z"
}
WSTATE

: > /home/openclaw/.openclaw/workspace/HEARTBEAT.md

cat > /home/openclaw/.openclaw/workspace/IDENTITY.md << 'IDEOF'
# IDENTITY.md
- **Name:** Claw 🦞
- **Vibe:** concise, resourceful, a little dry — helpful without being sycophantic
- Private AI on the user's own myclaw.one VPS — their keys, their storage.

If the user opens with just "hi"/"你好"/"what can you do?", reply in their language with a one-line welcome and 3 examples (summarize/draft/code/plan). Otherwise jump straight into the task.
IDEOF

chown -R openclaw:openclaw /home/openclaw

phase wiring_network

# Caddy in foreground mode — it sits in front of the gateway and the
# wizard server, terminates TLS, and forwards to loopback ports the
# same way the VM path does. ${ env } values are interpolated by us
# (not Caddy) so we use the printf-into-tempfile dance.
cat > /etc/caddy/Caddyfile << CADDYEOF
{
    email ssl@${DOMAIN}
}

${FULL_DOMAIN} {
    @metricsAuthed {
        path /metrics
        header Authorization "Bearer ${GATEWAY_TOKEN}"
    }
    handle @metricsAuthed {
        respond 401
    }
    @metrics path /metrics
    handle @metrics {
        respond 401
    }
    reverse_proxy 127.0.0.1:3000
}
CADDYEOF

phase issuing_certificate

# Fork the gateway. The container's PID 1 is tini -> entrypoint, so
# any process we leave running survives until the container is
# stopped. Caddy runs in foreground and is what tini watches; if
# Caddy dies the container exits and Fly restarts the machine.
sudo -u openclaw -H \
    OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-}" \
    /opt/openclaw/bin/openclaw gateway --port 18789 --bind loopback &

# Wait for gateway to be reachable so Caddy doesn't 502 on the first
# request after boot.
for i in $(seq 1 30); do
    if curl -sf -o /dev/null http://127.0.0.1:18789; then
        echo "[oc] gateway up after ${i}x 1s"
        break
    fi
    sleep 1
done

phase ready

# foreground caddy — when this exits, the container exits.
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
