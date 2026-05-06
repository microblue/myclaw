#!/bin/bash
# Installed once on every freshly provisioned claw box, kicked off by
# the oc-stu-i.service one-shot unit that cloud-init drops on disk.
# Lives outside cloud-init because the 16 KB Lightsail userData cap
# can't fit npm + Next.js bootstrap. Reads GATEWAY_TOKEN from the
# environment (the systemd unit sets it via Environment=).
#
# Idempotent: writes /opt/openclaw-studio/.installed at the end and
# the unit's `ConditionPathExists=!` skips re-runs.

set -euo pipefail

: "${GATEWAY_TOKEN:?GATEWAY_TOKEN env var required}"

# Node 20+ — apt's default `nodejs` package on 22.04/24.04 is too old.
# nodesource's setup script is idempotent.
if ! command -v node >/dev/null 2>&1 || [[ $(node -v | sed 's/v\([0-9]*\).*/\1/') -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# Studio expects `~/.openclaw/openclaw-studio/settings.json` with the
# upstream gateway URL+token. We're root, so $HOME=/root.
mkdir -p /root/.openclaw/openclaw-studio
cat > /root/.openclaw/openclaw-studio/settings.json << SETTINGS
{
  "gatewayUrl": "ws://127.0.0.1:18789",
  "gatewayToken": "${GATEWAY_TOKEN}"
}
SETTINGS

# Pre-warm npx cache so the systemd ExecStart doesn't try to download
# on a slow link and Type=simple times out before Studio binds :3000.
npm install -g openclaw-studio@latest

# Resolve the installed entrypoint. `npm i -g` puts it on PATH; in case
# the package ships under a different bin name, fall back to npx.
STUDIO_BIN="$(command -v openclaw-studio || true)"
[ -z "${STUDIO_BIN}" ] && STUDIO_BIN="/usr/bin/npx -y openclaw-studio@latest"

cat > /etc/systemd/system/openclaw-studio.service << UNIT
[Unit]
Description=OpenClaw Studio (web UI)
After=openclaw-gateway.service network-online.target
Wants=openclaw-gateway.service

[Service]
# Studio reads STUDIO_ACCESS_TOKEN as the cookie-setting bearer for
# any non-loopback bind. We reuse the gateway token so the dashboard
# can deep-link with `?access_token=…` and the user lands authed.
Environment=STUDIO_ACCESS_TOKEN=${GATEWAY_TOKEN}
Environment=HOST=127.0.0.1
Environment=PORT=3000
Environment=NODE_ENV=production
ExecStart=${STUDIO_BIN}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now openclaw-studio.service

mkdir -p /opt/openclaw-studio
touch /opt/openclaw-studio/.installed
echo "openclaw-studio installed at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
