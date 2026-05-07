#!/bin/bash
# install-claw.sh — OpenClaw AI-OS installer
#
# Runs on a freshly-provisioned VM (Hetzner / Lightsail / DigitalOcean,
# x86_64 or ARM64 Debian/Ubuntu) and brings up the full claw runtime:
# OpenClaw gateway + Caddy reverse proxy + setup wizard + Open WebUI
# bridge + node_exporter + greatlove plugin + studio loader.
#
# Per docs/aios-design.md §9 P2a, this script lives in the API repo
# and is served at https://<domain>/api/cloud-scripts/install-claw
# so cloud-init bootstrap shrinks to a ~25-line `curl|bash` wrapper
# that fits comfortably under Lightsail's 16 KB userData cap.
#
# Required env vars (the cloud-init wrapper exports these from the
# claws row before invoking us):
#   ROOT_PASSWORD     — root login password (rendered into chpasswd)
#   SUBDOMAIN         — the claw's subdomain (e.g. cosmic-dune)
#   DOMAIN            — top-level domain (myclaw.one)
#   GATEWAY_TOKEN     — inbound bearer for openclaw gateway
#   CONFIG_JSON_B64   — base64-encoded openclaw.json (per-claw config)
# Optional env vars:
#   OPENROUTER_API_KEY — built-in LLM key baked into systemd unit
#   IE / IT / IR       — install-progress reporter context (claws_install_phases)

set -eu
exec > >(tee -a /var/log/openclaw-bootstrap.log) 2>&1
echo "=== openclaw bootstrap starting at $(date -u) ==="

mkdir -p /var/lib/openclaw-bootstrap
BOOTSTRAP_STATE=/var/lib/openclaw-bootstrap/state

stage() {
    echo "stage=$1 at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BOOTSTRAP_STATE"
    echo "[oc] >>> $1"
}
phase() {
    [ -z "${IE:-}" ] && return 0
    curl -fsS --max-time 10 -X POST "$IE" -H "Authorization: Bearer $IT" -H 'Content-Type: application/json' -d "{\"phase\":\"$1\",\"runId\":\"$IR\",\"logTail\":\"\"}" >/dev/null 2>&1 || true
}
trap 'rc=$?; [ $rc -ne 0 ] && { S=$(awk -F= "/^stage=/{print \$2}" "$BOOTSTRAP_STATE" 2>/dev/null); echo "status=failed stage=$S rc=$rc" > "$BOOTSTRAP_STATE"; echo "[oc] FAILED stage=$S rc=$rc"; phase failed; }' EXIT

with_retry() {
    local attempts=5 delay=3 i=1
    while true; do
        if "$@"; then return 0; fi
        if [ $i -ge $attempts ]; then
            echo "[oc] retry exhausted ($attempts): $*"
            return 1
        fi
        echo "[oc] attempt $i/$attempts failed, sleep ${delay}s: $*"
        sleep $delay
        delay=$((delay * 2))
        i=$((i + 1))
    done
}

# Sanity-check required env up front so we fail loudly with a clear
# message rather than ending up with a half-built VM.
: "${ROOT_PASSWORD:?ROOT_PASSWORD is required}"
: "${SUBDOMAIN:?SUBDOMAIN is required}"
: "${DOMAIN:?DOMAIN is required}"
: "${GATEWAY_TOKEN:?GATEWAY_TOKEN is required}"
: "${CONFIG_JSON_B64:?CONFIG_JSON_B64 is required}"

FULL_DOMAIN="${SUBDOMAIN}.${DOMAIN}"

phase mounting_storage
stage sshd-config
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication yes/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin yes/' /etc/ssh/sshd_config
mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/00-openclaw.conf << 'SSHCONF'
PasswordAuthentication yes
PermitRootLogin yes
SSHCONF
for svc in sshd ssh; do systemctl restart $svc 2>/dev/null && break; done || true
printf 'root:%s\n' "$ROOT_PASSWORD" | chpasswd
chage -d 99999 root || true

stage swap
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

phase installing_kernel
stage apt-base
export DEBIAN_FRONTEND=noninteractive
mkdir -p /etc/apt/keyrings
with_retry curl -fsSL -o /etc/apt/keyrings/nodesource.gpg.key https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key
gpg --dearmor --batch --yes -o /etc/apt/keyrings/nodesource.gpg /etc/apt/keyrings/nodesource.gpg.key
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
with_retry curl -fsSL -o /etc/apt/keyrings/caddy.gpg.key https://dl.cloudsmith.io/public/caddy/stable/gpg.key
gpg --dearmor --batch --yes -o /etc/apt/keyrings/caddy.gpg /etc/apt/keyrings/caddy.gpg.key
echo "deb [signed-by=/etc/apt/keyrings/caddy.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" > /etc/apt/sources.list.d/caddy.list
with_retry apt-get update
with_retry apt-get install -y curl caddy ufw ca-certificates gnupg git dnsutils nodejs

stage openclaw-user
id openclaw >/dev/null 2>&1 || useradd -r -m -d /home/openclaw -s /bin/bash openclaw
echo 'openclaw ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/openclaw

phase loading_skills
stage openclaw-install
mkdir -p /opt/openclaw
chown -R openclaw:openclaw /opt/openclaw
sudo -u openclaw -H npm config set prefix /opt/openclaw
with_retry sudo -u openclaw -H npm install -g --prefer-offline --no-audit --no-fund openclaw@2026.4.11
echo 'export PATH=/opt/openclaw/bin:$PATH' > /etc/profile.d/openclaw.sh
chmod 644 /etc/profile.d/openclaw.sh

stage chrome
CHROME_ARCH=$(dpkg --print-architecture)
case "$CHROME_ARCH" in
    amd64)
        CHROME_URL='https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb'
        ;;
    *)
        CHROME_URL=''
        ;;
esac
if [ -n "$CHROME_URL" ]; then
    with_retry curl -fsSL -o /tmp/google-chrome.deb "$CHROME_URL"
    dpkg -i /tmp/google-chrome.deb || with_retry apt-get install -f -y
    rm -f /tmp/google-chrome.deb
else
    echo "[oc] no Chrome .deb for $CHROME_ARCH; installing chromium from apt"
    with_retry apt-get install -y chromium || with_retry apt-get install -y chromium-browser || true
fi

stage node-exporter
(
    NE_VERSION=1.8.2
    NE_ARCH=$(dpkg --print-architecture)
    case "$NE_ARCH" in
        amd64|arm64) NE_PKG="node_exporter-$NE_VERSION.linux-$NE_ARCH" ;;
        *)
            echo "[oc] node_exporter has no prebuilt for $NE_ARCH; skipping"
            exit 0
            ;;
    esac
    id node_exporter >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin node_exporter
    mkdir -p /opt/node_exporter
    with_retry curl -4 -fsSL -o /tmp/node_exporter.tgz "https://github.com/prometheus/node_exporter/releases/download/v$NE_VERSION/$NE_PKG.tar.gz"
    tar -xzf /tmp/node_exporter.tgz -C /tmp/
    install -o node_exporter -g node_exporter -m 0755 "/tmp/$NE_PKG/node_exporter" /opt/node_exporter/node_exporter
    rm -rf /tmp/node_exporter.tgz "/tmp/$NE_PKG"
    cat > /etc/systemd/system/node_exporter.service << 'NESVC'
[Unit]
Description=Prometheus node_exporter
After=network.target

[Service]
Type=simple
User=node_exporter
Group=node_exporter
ExecStart=/opt/node_exporter/node_exporter --web.listen-address=127.0.0.1:9100 --collector.disable-defaults --collector.cpu --collector.meminfo --collector.filesystem --collector.loadavg --collector.uname --collector.filesystem.mount-points-exclude=^/(dev|proc|sys|run|var/lib/docker|snap)($$|/)
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
NESVC
    systemctl daemon-reload
    systemctl enable node_exporter
    systemctl start node_exporter
) || echo "[oc] node_exporter setup failed; Overview metrics will read 'unavailable' on this claw"

phase calibrating_agents
stage openclaw-config
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

# Render the gateway systemd unit. The OPENROUTER_API_KEY environment
# line is conditionally emitted — when no built-in key is configured
# the unit is identical to one without the env line.
{
    cat << 'SVC1'
[Unit]
Description=OpenClaw Gateway
After=network.target

[Service]
Type=simple
User=openclaw
Group=openclaw
WorkingDirectory=/home/openclaw
Environment=HOME=/home/openclaw
Environment=NODE_ENV=production
SVC1
    if [ -n "${OPENROUTER_API_KEY:-}" ]; then
        echo "Environment=OPENROUTER_API_KEY=${OPENROUTER_API_KEY}"
    fi
    cat << 'SVC2'
ExecStart=/opt/openclaw/bin/openclaw gateway --port 18789 --bind loopback
Restart=always
RestartSec=10
StartLimitIntervalSec=0
StandardOutput=append:/var/log/openclaw-gateway.log
StandardError=append:/var/log/openclaw-gateway.log

[Install]
WantedBy=multi-user.target
SVC2
} > /etc/systemd/system/openclaw-gateway.service

stage version-watcher
(curl -fsSL "https://${DOMAIN}/oc-watcher.sh"|bash) || echo "[oc] watcher install failed"

stage greatlove-install
(
    with_retry curl -fsSL -o /tmp/gl.tgz "https://${DOMAIN}/downloads/greatlove-openclaw-plugin-1.0.0.tgz"
    with_retry sudo -u openclaw -H /opt/openclaw/bin/openclaw plugins install /tmp/gl.tgz
) || echo "[oc] greatlove plugin install failed"

phase wiring_network
stage firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

stage gateway-start
systemctl daemon-reload
systemctl enable openclaw-gateway
systemctl start openclaw-gateway

for i in $(seq 1 30); do
    if curl -sf -o /dev/null http://127.0.0.1:18789; then
        echo "[oc] gateway up after ${i}x 5s"
        break
    fi
    sleep 5
done

stage dns-wait
echo "[oc] waiting for DNS record for ${FULL_DOMAIN}"
for i in $(seq 1 30); do
    if host "${FULL_DOMAIN}" 1.1.1.1 > /dev/null 2>&1; then
        echo "[oc] DNS resolved after ${i}x 2s"
        break
    fi
    sleep 2
done

stage wizard
mkdir -p /etc/systemd/system/openclaw-gateway.service.d
(
    mkdir -p /var/www/myclaw /opt/myclaw-wizard
    with_retry curl -fsSL -o /var/www/myclaw/index.html "https://${DOMAIN}/wizard/v1.html"
    with_retry curl -fsSL -o /opt/myclaw-wizard/server.mjs "https://${DOMAIN}/wizard/v1-server.mjs"
    chown -R openclaw:openclaw /opt/myclaw-wizard
    cat > /etc/systemd/system/myclaw-wizard.service << 'WSVC'
[Unit]
Description=Claw Setup Wizard
After=network.target openclaw-gateway.service

[Service]
Type=simple
User=openclaw
Group=openclaw
WorkingDirectory=/home/openclaw
Environment=HOME=/home/openclaw
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/myclaw-wizard/server.mjs
Restart=always
RestartSec=10
StandardOutput=append:/var/log/myclaw-wizard.log
StandardError=append:/var/log/myclaw-wizard.log

[Install]
WantedBy=multi-user.target
WSVC
    systemctl daemon-reload
    systemctl enable myclaw-wizard
    systemctl start myclaw-wizard
    for i in $(seq 1 20); do ss -tln | grep -q :18790 && break; sleep 1; done
) || echo "[oc] wizard setup failed; /myclaw/ will 404 on this claw — Control UI at / still works"

phase issuing_certificate
stage caddy
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
        reverse_proxy 127.0.0.1:9100
    }
    @metrics path /metrics
    handle @metrics {
        respond 401
    }
    @wizardApi path /myclaw/api/*
    handle @wizardApi {
        reverse_proxy 127.0.0.1:18790 {
            lb_try_duration 10s
        }
    }
    @wizardStatic path /myclaw /myclaw/*
    handle @wizardStatic {
        root * /var/www
        file_server
    }
    reverse_proxy 127.0.0.1:3000
}
CADDYEOF
systemctl enable caddy
systemctl restart caddy

cat > /etc/systemd/system/oc-stu-i.service << EOF
[Unit]
After=openclaw-gateway.service network-online.target
ConditionPathExists=!/opt/openclaw-studio/.installed
[Service]
Type=oneshot
Environment=GATEWAY_TOKEN=${GATEWAY_TOKEN}
ExecStart=/bin/bash -c "curl -fsSL https://${DOMAIN}/api/cloud-scripts/install-studio|bash"
[Install]
WantedBy=multi-user.target
EOF
systemctl enable oc-stu-i.service

echo "status=ok at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BOOTSTRAP_STATE"
echo "=== openclaw bootstrap finished at $(date -u) ==="
phase ready
