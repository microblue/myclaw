#!/bin/bash
# install-studio.sh — install openclaw-studio onto a freshly-provisioned claw.
#
# Why we don't use the openclaw-studio npm package's auto-bootstrap any more:
# `npm i -g openclaw-studio` installs a wrapper that, on first run, clones
# the studio source from GitHub into /openclaw-studio, runs `npm install`,
# and then starts `npm run dev` (Next.js dev mode). The dev server's custom
# entrypoint (server/index.js --dev) reads `.next/dev/required-server-files.json`,
# which only `next build` (production) generates — so every fresh claw served
# 500 errors forever. Documented on nimble-panda 2026-05-07 incident.
#
# The fix: do the work ourselves — `git clone` the source, `npm install`,
# `npm run build` for production output, then run `npm run start` from a
# systemd unit. Drops the buggy wrapper entirely.
#
# Reads GATEWAY_TOKEN from env (the install-claw.sh inline call exports it).

set -euo pipefail

: "${GATEWAY_TOKEN:?GATEWAY_TOKEN env var required}"

# Node 22+ is already installed by install-claw.sh's apt-base stage,
# but be defensive in case this script is invoked standalone for repair.
if ! command -v node >/dev/null 2>&1 || [[ $(node -v | sed 's/v\([0-9]*\).*/\1/') -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
fi

# Pin the studio source revision so all freshly-provisioned claws build the
# same tree — `main` would silently follow upstream and a regression there
# would break every new claw. Bump this commit when we're ready to ship a
# new studio across all new claws.
#
# Source repo: https://github.com/grp06/openclaw-studio
# Pinned ref:  main as of 2026-05-07 (the version known to build cleanly
# at the time of the production setup-flow audit).
STUDIO_REPO='https://github.com/grp06/openclaw-studio.git'
STUDIO_REF='main'

STUDIO_DIR='/openclaw-studio'

# Idempotency: if /openclaw-studio is already a working studio install,
# skip the clone+build steps. The marker file is written at the end so
# a partial install won't be considered "done".
if [ -f "${STUDIO_DIR}/.installed" ]; then
    echo "[studio] already installed, skipping clone/build"
else
    rm -rf "${STUDIO_DIR}"
    git clone --depth 1 --branch "${STUDIO_REF}" "${STUDIO_REPO}" "${STUDIO_DIR}"
    pushd "${STUDIO_DIR}" >/dev/null

    # Rebrand pass — replace the upstream "OpenClaw Studio" wordmark with
    # "MyClaw.One Control Panel" in source files BEFORE the production
    # build, so the build output bakes our brand into the static HTML /
    # page titles / header text. We deliberately only touch the Studio
    # compound brand ("OpenClaw Studio"), not bare "OpenClaw" mentions
    # in helper copy ("Studio reaches OpenClaw…") — those refer to the
    # underlying gateway runtime which keeps its OSS name.
    grep -rl --include='*.ts' --include='*.tsx' --include='*.js' \
        'OpenClaw Studio' src 2>/dev/null \
        | xargs -r sed -i 's/OpenClaw Studio/MyClaw.One Control Panel/g'

    # iPad-landscape patch — upstream uses xl: (1280px) as the breakpoint
    # between the mobile pane-toggle (Fleet | Chat tabs) and the
    # split-pane layout. iPad landscape is 1024×768 which is below xl,
    # so users saw the cramped tab toggle even though they had plenty of
    # horizontal room. Drop the threshold to lg: (1024px) so iPad
    # landscape gets the two-column layout.
    sed -i \
        -e 's|flex min-h-0 flex-1 flex-col gap-4 xl:flex-row|flex min-h-0 flex-1 flex-col gap-4 lg:flex-row|' \
        -e 's|glass-panel ui-panel p-2 xl:hidden|glass-panel ui-panel p-2 lg:hidden|' \
        -e 's|min-h-0 xl:block xl:min-h-0|min-h-0 lg:block lg:min-h-0|' \
        -e 's|overflow-hidden xl:flex|overflow-hidden lg:flex|' \
        src/app/page.tsx
    sed -i \
        -e 's|xl:max-w-\[320px\] xl:border-r xl:border-sidebar-border|lg:max-w-[320px] lg:border-r lg:border-sidebar-border|' \
        src/features/agents/components/FleetSidebar.tsx

    npm install --no-audit --no-fund
    # `next build` produces `.next/required-server-files.json` which the
    # custom server reads on every request — without this file the server
    # 500s on every route. Has to run before the systemd unit starts.
    npm run build
    popd >/dev/null
    touch "${STUDIO_DIR}/.installed"
fi

# Settings.json wires Studio to the local gateway. Studio reads it from
# $HOME/.openclaw/openclaw-studio/settings.json on startup.
#
# Schema MUST match what server/studio-settings.js expects: a nested
# `{ gateway: { url, token } }` object. We previously wrote the flat
# `{ gatewayUrl, gatewayToken }` shape and Studio fell through to its
# "Configure gateway" modal even though the file was in the right
# place — the keys it looks for are gateway.url and gateway.token.
mkdir -p /root/.openclaw/openclaw-studio
cat > /root/.openclaw/openclaw-studio/settings.json << SETTINGS
{
  "gateway": {
    "url": "ws://127.0.0.1:18789",
    "token": "${GATEWAY_TOKEN}"
  }
}
SETTINGS

# Mirror the same settings for the openclaw user, in case we later switch
# Studio to run as that user (currently runs as root for filesystem
# convenience — Studio has to npm-install at boot if it ever needs to
# repair the build, and only root has /openclaw-studio write access).
mkdir -p /home/openclaw/.openclaw/openclaw-studio
cp /root/.openclaw/openclaw-studio/settings.json \
    /home/openclaw/.openclaw/openclaw-studio/settings.json
chown -R openclaw:openclaw /home/openclaw/.openclaw/openclaw-studio

cat > /etc/systemd/system/openclaw-studio.service << UNIT
[Unit]
Description=MyClaw.One Control Panel (web UI, production mode)
After=openclaw-gateway.service network-online.target
Wants=openclaw-gateway.service

[Service]
# STUDIO_ACCESS_TOKEN is the cookie-setting bearer for any non-loopback
# bind. We reuse the gateway token so the dashboard can deep-link with
# an access_token query param and the user lands authed. The comment
# avoids backticks because this heredoc is unquoted-delimiter and bash
# would command-substitute anything in backticks (a real bug we hit
# before — see install-claw.sh studio-install stage notes).
Environment=STUDIO_ACCESS_TOKEN=${GATEWAY_TOKEN}
Environment=HOST=127.0.0.1
Environment=PORT=3000
Environment=NODE_ENV=production
WorkingDirectory=${STUDIO_DIR}
ExecStart=/usr/bin/npm run start
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
