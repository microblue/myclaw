import applyToolsDefaults from '@/controllers/claws/helpers/applyToolsDefaults'

// Emits a plain bash script, not a #cloud-config YAML. Lightsail
// prepends its own shell preamble to user-data (SSH CA registration
// etc.), which makes cloud-init treat the whole thing as a shell
// script and a YAML-formatted file explodes at the first `ssh_pwauth:`
// line ("not found" for every directive). Shell works on all three
// providers (Lightsail / Hetzner / DigitalOcean) even with an injected
// preamble, so this is the portable path.

const generateCloudInit = (
    rootPassword: string,
    subdomain: string,
    domain: string,
    gatewayToken: string,
    llm?: { openrouterApiKey?: string | null; defaultModel?: string | null }
): string => {
    const fullDomain = `${subdomain}.${domain}`
    const config: Record<string, unknown> = {
        // Control UI chrome + status contexts read ui.assistant for the
        // chat header avatar + display name. Set these explicitly so the
        // customer sees "Claw" with the myclaw logo instead of OpenClaw's
        // default placeholder. The URL must be a real static asset —
        // `/logo.png` resolves to the SPA index.html (text/html) and
        // makes the <img> 404-render as a broken icon.
        ui: {
            assistant: {
                name: 'Claw',
                avatar: 'https://myclaw.one/myclaw-logo.svg'
            }
        },
        gateway: {
            mode: 'local',
            // Disable openclaw's config-watcher reload pipeline. openclaw
            // periodically rewrites its own config (every config write
            // re-stamps `meta.lastTouchedAt` via stampConfigVersion in
            // io-*.js) but the watcher does not de-dup self-writes, so
            // every internal write hits matchRule(), falls through with
            // no rule for `meta.*`, and sets restartGateway=true — a
            // 12-min self-restart loop on a fresh claw, with each cycle
            // re-running plugin runtime-deps install and saturating the
            // event loop for ~30-60s. With mode=off the watcher's
            // dispatch returns early before queueRestart, so internal
            // writes (admin UI key rotations, channel health state, etc.)
            // simply persist without bouncing the process. Trade-off:
            // admin-ui-driven config changes need a manual restart to
            // take effect — acceptable for our deployment shape.
            // ma4mzhe7 incident 2026-04-30 — see config-reload-*.js,
            // BASE_RELOAD_RULES has no entry for `meta`.
            reload: { mode: 'off' },
            auth: {
                mode: 'token',
                token: gatewayToken
            },
            remote: {
                token: gatewayToken
            },
            controlUi: {
                allowInsecureAuth: true,
                allowedOrigins: ['*'],
                dangerouslyDisableDeviceAuth: true
            },
            trustedProxies: ['127.0.0.1', '::1'],
            // Open WebUI is wired in as the default chat UI for OpenClaw
            // claws (replaces the stock Control UI). It speaks generic
            // OpenAI to OpenClaw's gateway, and that endpoint is OFF by
            // default — flip it on so /v1/models + /v1/chat/completions
            // become reachable. Verified live on cosmic-dune 2026-04-22.
            http: {
                endpoints: {
                    chatCompletions: { enabled: true }
                }
            }
        },
        channels: {
            // Channels ship enabled. openclaw's Control UI hides any
            // channel with `enabled: false` from the channels tab — so
            // disabling them by default removes them from the list and
            // users can't even see them to configure credentials. The
            // 8s/15min health-monitor restart spike that v1.16 tried to
            // suppress was a cosmetic event-loop blip with no chat
            // impact, so visibility wins (v1.16 reverted in v1.17,
            // ma4mzhe7 UX incident 2026-05-01).
            whatsapp: { dmPolicy: 'open', allowFrom: ['*'], enabled: true },
            telegram: { dmPolicy: 'open', allowFrom: ['*'], enabled: true },
            discord: { enabled: true },
            slack: { enabled: true },
            signal: { dmPolicy: 'open', allowFrom: ['*'], enabled: true }
        },
        commands: {
            restart: true,
            bash: true
        },
        browser: {
            enabled: true,
            executablePath: '/usr/bin/google-chrome-stable',
            headless: true,
            noSandbox: true
        },
        // Same rationale as the channel `enabled` flags — without
        // these pre-populated, the first-boot normalizer fills them
        // in and rewrites, triggering a restart. We list every plugin
        // our config actually uses.
        plugins: {
            entries: {
                openrouter: { enabled: true },
                browser: { enabled: true }
            }
        }
    }

    applyToolsDefaults(config)
    const agentsConfig: Record<string, unknown> = {
        defaults: { sandbox: { mode: 'off' } as Record<string, unknown> }
    }

    // Wire the platform-default LLM so the Control UI lands with a
    // working model on first open. Admin can rotate the key or default
    // model via /admin/settings; each new claw picks up the live values
    // at provision time.
    //
    // Shape mirrors what `openclaw onboard` writes when the user picks
    // OpenRouter. OpenRouter is a built-in extension
    // (enabledByDefault=true), so we don't configure a custom
    // `models.providers.openrouter` block — the extension picks up the
    // API key from the gateway process env (systemd unit below).
    //
    // Model refs must be provider-qualified (`openrouter/<slug>`); a
    // bare ref like `deepseek/deepseek-v3.2` is parsed as
    // provider=deepseek by the runtime and fails with "Unknown model".
    // Auto-prefix when the admin's saved value is a bare slug.
    const modelRef = llm?.openrouterApiKey
        ? (() => {
              const raw = llm.defaultModel?.trim() || 'auto'
              return raw.startsWith('openrouter/') ? raw : `openrouter/${raw}`
          })()
        : null

    if (modelRef) {
        ;(agentsConfig.defaults as Record<string, unknown>).model = {
            primary: modelRef
        }
        ;(agentsConfig.defaults as Record<string, unknown>).models = {
            [modelRef]: { alias: 'OpenRouter' }
        }
    }

    config.agents = agentsConfig

    // `meta` block is the third piece that openclaw would otherwise
    // add on first boot (alongside channel.enabled + plugins.entries).
    // Pre-populating it prevents the "missing-meta-before-write"
    // anomaly + the resulting rewrite. `lastTouchedVersion` should
    // match the openclaw version we pin in the install step below
    // so openclaw's own stamping logic sees no drift. `lastTouchedAt`
    // is a fixed pre-installation marker; openclaw rewrites it the
    // first time it touches the config for any other reason (a user
    // config change, a plugin toggle, etc.), which is fine.
    config.meta = {
        lastTouchedVersion: '2026.4.11',
        lastTouchedAt: '2026-04-01T00:00:00.000Z'
    }

    // 1-space indent (vs 2) shaves ~250 bytes off the rendered cloud-init
    // — Lightsail's userData cap is 16 KB after base64, and we were going
    // over with 2-space pretty print. Tests still pass because non-zero
    // indent keeps the `": "` separator they grep for.
    const configJson = JSON.stringify(config, null, 1)

    // Root password injected via printf %s to survive any shell
    // metacharacters in the generated password.
    const rootPwEscaped = rootPassword.replace(/'/g, "'\\''")

    const script = `#!/bin/bash
# Lightsail prepends its own "#!/bin/sh" preamble to the user-data,
# so the whole thing actually runs under dash (posix sh) by default.
# dash doesn't support process substitution (>(...)) or other bash
# bits we rely on below, so if we're not already in bash, re-exec
# the entire combined script under bash. Lightsail's own preamble
# is idempotent (cat > ..., echo >> ...), so re-running it is fine.
[ -z "\${BASH_VERSION:-}" ] && exec /bin/bash "$0" "$@"
set -eu
exec > >(tee -a /var/log/openclaw-bootstrap.log) 2>&1
echo "=== openclaw bootstrap starting at $(date -u) ==="

# Status sentinel — the dashboard / syncClawServers can't see this
# directly (we don't SSH during sync) but it survives reboots and is
# visible via the Logs tab or SSH when a user asks "why is it stuck?".
# We touch it at each major stage and final status so failures point
# at a specific step instead of just "cloud-init never finished".
mkdir -p /var/lib/openclaw-bootstrap
BOOTSTRAP_STATE=/var/lib/openclaw-bootstrap/state
stage() {
    echo "stage=$1 at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BOOTSTRAP_STATE"
    echo "[bootstrap] >>> $1"
}
trap 'rc=$?; [ $rc -ne 0 ] && { echo "status=failed stage=$(awk -F= "/^stage=/{print \\$2}" "$BOOTSTRAP_STATE" 2>/dev/null) exitCode=$rc at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BOOTSTRAP_STATE"; echo "[bootstrap] !!! FAILED (rc=$rc, stage=$(awk -F= \\"/^stage=/{print \\\\\\$2}\\" "$BOOTSTRAP_STATE" 2>/dev/null))"; }' EXIT

# Retry any command up to 5 times with exponential backoff. Every
# external resource fetch (apt, npm, curl, dpkg) goes through this —
# transient network blips on a fresh VM, registry 5xx, apt-lock
# contention, etc. are the rule, not the exception.
with_retry() {
    local attempts=5 delay=3 i=1
    while true; do
        if "$@"; then return 0; fi
        if [ $i -ge $attempts ]; then
            echo "[bootstrap] retry exhausted ($attempts attempts): $*"
            return 1
        fi
        echo "[bootstrap] attempt $i/$attempts failed, sleeping \${delay}s: $*"
        sleep $delay
        delay=$((delay * 2))
        i=$((i + 1))
    done
}

stage sshd-config
# Enable SSH password + root login. sshd uses first-match for these
# directives, so AWS Lightsail's /etc/ssh/sshd_config.d/50-cloud-init.conf
# (PasswordAuthentication no) wins over anything we put in the main
# config. Drop an override file that sorts first alphabetically AND
# flip the main config, so on any provider the result is the same.
sed -i 's/^#\\?PasswordAuthentication .*/PasswordAuthentication yes/' /etc/ssh/sshd_config
sed -i 's/^#\\?PermitRootLogin .*/PermitRootLogin yes/' /etc/ssh/sshd_config
mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/00-openclaw.conf << 'SSHCONF'
PasswordAuthentication yes
PermitRootLogin yes
SSHCONF
for svc in sshd ssh; do systemctl restart $svc 2>/dev/null && break; done || true
printf 'root:%s\\n' '${rootPwEscaped}' | chpasswd
chage -d 99999 root || true

stage swap
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

stage apt-base
export DEBIAN_FRONTEND=noninteractive
# Add NodeSource (for node 22) and Caddy (cloudsmith stable) before
# the single apt-get update so we pay one round-trip, not three.
# Caddy replaces nginx + certbot here — its on-by-default automatic
# HTTPS via ACME means no certbot retry loop, and its Caddyfile is
# ~10 lines vs nginx's 40+. Net: smaller cloud-init, fewer moving
# parts to fail during bootstrap.
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
# Create the unprivileged user *before* installing openclaw. The
# gateway runs as this user (see systemd unit below) and self-update
# from the WebUI needs the user to own its own install prefix end-to-end —
# pre-2026-04-29 claws had openclaw at /usr/lib/node_modules (root-owned)
# but the gateway running as openclaw, so the WebUI Update button died
# with EACCES at the staging step.
if ! id openclaw >/dev/null 2>&1; then
    useradd -r -m -d /home/openclaw -s /bin/bash openclaw
fi
echo 'openclaw ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/openclaw

stage openclaw-install
# Pinned version, not @latest, so a registry-side push doesn't silently
# change what new claws boot with. Bump after smoke-testing the new
# version's WebUI Update flow on a staging claw.
#
# Installed under /opt/openclaw owned by the openclaw user (see above)
# so npm self-update via the WebUI can mkdtemp + rename + symlink-swap
# inside its own prefix without root.
#
# --prefer-offline: if npm already has tarballs cached, skip the HEAD
#   check round-trips (typically saves 10–30s on cold boots).
# --no-audit / --no-fund: cosmetic output; skip the registry round-trip
#   for vulnerability scan we'd ignore anyway on a single-package install.
mkdir -p /opt/openclaw
chown -R openclaw:openclaw /opt/openclaw
sudo -u openclaw -H npm config set prefix /opt/openclaw
with_retry sudo -u openclaw -H npm install -g --prefer-offline --no-audit --no-fund openclaw@2026.4.11
echo 'export PATH=/opt/openclaw/bin:$PATH' > /etc/profile.d/openclaw.sh
chmod 644 /etc/profile.d/openclaw.sh

stage chrome
# Architecture-aware Chrome install — we used to hard-code amd64 which
# breaks the moment someone boots an ARM64 Lightsail / Hetzner ARM.
CHROME_ARCH=$(dpkg --print-architecture)
case "$CHROME_ARCH" in
    amd64)
        CHROME_URL='https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb'
        ;;
    arm64)
        # Google doesn't publish an arm64 .deb — fall through to
        # Chromium from apt, which is close enough for headless.
        CHROME_URL=''
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
    echo "[bootstrap] no Chrome .deb for $CHROME_ARCH; installing chromium from apt"
    with_retry apt-get install -y chromium || with_retry apt-get install -y chromium-browser || true
fi

stage node-exporter
# Prometheus node_exporter feeds the Overview tab's CPU/Memory/Disk tiles.
# Listens loopback-only on :9100; nginx exposes /metrics gated by the
# gateway token (same secret the Control UI uses), so the api can fetch
# https://<sub>.${domain}/metrics with the token in the Authorization
# header. Disabled-collectors keeps the surface to just what we render.
#
# Whole stage is wrapped in a subshell + soft-fail || , so if any step
# (github download, tarball extract, systemd start) fails, bootstrap
# keeps marching to nginx + certbot. The user can still chat with the
# claw — Overview just shows "metrics unavailable". An aborted bootstrap
# here would leave the claw with no SSL and the api would mark it
# unreachable after the 20 min provision timeout (incident:
# silent-moth, 2026-04-30).
(
    NE_VERSION=1.8.2
    NE_ARCH=$(dpkg --print-architecture)
    case "$NE_ARCH" in
        amd64|arm64) NE_PKG="node_exporter-$NE_VERSION.linux-$NE_ARCH" ;;
        *)
            echo "[bootstrap] node_exporter has no prebuilt for $NE_ARCH; skipping"
            exit 0
            ;;
    esac
    if ! id node_exporter >/dev/null 2>&1; then
        useradd -r -s /usr/sbin/nologin node_exporter
    fi
    mkdir -p /opt/node_exporter
    # -4 forces IPv4 — Lightsail's IPv6 route to github.com sometimes
    # blackholes on first boot, and the curl default of "happy eyeballs"
    # then takes ~20s+ to fall back to v4. -fsSL still follows redirects.
    with_retry curl -4 -fsSL -o /tmp/node_exporter.tgz "https://github.com/prometheus/node_exporter/releases/download/v$NE_VERSION/$NE_PKG.tar.gz"
    tar -xzf /tmp/node_exporter.tgz -C /tmp/
    install -o node_exporter -g node_exporter -m 0755 "/tmp/$NE_PKG/node_exporter" /opt/node_exporter/node_exporter
    rm -rf /tmp/node_exporter.tgz "/tmp/$NE_PKG"
    # systemd treats $X in Exec lines as env-var refs and passes
    # unrecognized ones through verbatim per the docs — but real-world
    # versions sometimes warn or strip, so escape with $$ to emit a
    # literal $ regardless. Same goes for any future $ in this unit.
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
) || echo "[bootstrap] node_exporter setup failed; Overview metrics will read 'unavailable' on this claw"

stage openclaw-config
mkdir -p /home/openclaw/.openclaw/agents/main/agent
cat > /home/openclaw/.openclaw/openclaw.json << 'OCCONFIG'
${configJson}
OCCONFIG

# Pre-mark the workspace as setup-complete so OpenClaw skips the
# "bootstrap onboarding" flow (BOOTSTRAP.md + name/creature/vibe/emoji
# Q&A) on first chat. Weaker models — including
# openrouter/google/gemini-2.5-flash-lite, our current default — can't
# reliably follow BOOTSTRAP.md's "then delete me when done" step and
# loop writing the file back every turn (openclaw#67575-style).
# Users who want a custom persona can still edit IDENTITY.md / USER.md
# after the fact. Without this, the setupCompletedAt transition needs
# BOOTSTRAP.md to not exist during an ensureAgentWorkspace pass, which
# is racy against the confused-agent writes.
mkdir -p /home/openclaw/.openclaw/workspace/.openclaw
cat > /home/openclaw/.openclaw/workspace/.openclaw/workspace-state.json << 'WSTATE'
{
  "version": 1,
  "bootstrapSeededAt": "2026-04-01T00:00:00.000Z",
  "setupCompletedAt": "2026-04-01T00:00:00.000Z"
}
WSTATE

# Silence the stock "Read HEARTBEAT.md / HEARTBEAT_OK" chatter:
# OpenClaw's heartbeat preflight skips the LLM call when this file is
# effectively empty, so an empty file keeps the Control UI's first
# chat turn clean. Leave AGENTS.md + USER.md to OpenClaw's defaults —
# Lightsail caps user-data at 16 KB and our pre-seeded versions blew
# past it (calm-birch incident 2026-04-21).
: > /home/openclaw/.openclaw/workspace/HEARTBEAT.md

# Branded identity for the Control UI (no native greeting/suggestions
# config in openclaw — schema 2026.4.19-beta.2). Kept short for the
# 16KB userData cap; richer welcome content lives in the SPA, not here.
cat > /home/openclaw/.openclaw/workspace/IDENTITY.md << 'IDEOF'
# IDENTITY.md
- **Name:** Claw 🦞
- **Vibe:** concise, resourceful, a little dry — helpful without being sycophantic
- Private AI on the user's own myclaw.one VPS — their keys, their storage.

If the user opens with just "hi"/"你好"/"what can you do?", reply in their language with a one-line welcome and 3 examples (summarize/draft/code/plan). Otherwise jump straight into the task.
IDEOF

chown -R openclaw:openclaw /home/openclaw

# systemd unit
cat > /etc/systemd/system/openclaw-gateway.service << 'SYSTEMD'
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
${llm?.openrouterApiKey ? `Environment=OPENROUTER_API_KEY=${llm.openrouterApiKey}\n` : ''}ExecStart=/opt/openclaw/bin/openclaw gateway --port 18789 --bind loopback
Restart=always
RestartSec=10
StartLimitIntervalSec=0
StandardOutput=append:/var/log/openclaw-gateway.log
StandardError=append:/var/log/openclaw-gateway.log

[Install]
WantedBy=multi-user.target
SYSTEMD

stage greatlove-install
# GreatLove channel plugin — served as a tarball from the SPA so we can
# rev it without re-rendering cloud-init. Soft-fail like wechat.
(
    with_retry curl -fsSL -o /tmp/gl.tgz https://myclaw.one/downloads/greatlove-openclaw-plugin-1.0.0.tgz
    with_retry sudo -u openclaw -H /opt/openclaw/bin/openclaw plugins install /tmp/gl.tgz
) || echo "[bootstrap] greatlove plugin install failed"

stage firewall
# Firewall before gateway/nginx so there's no window where a service
# is listening with the firewall still transitioning. ufw reload
# doesn't drop existing connections — safe to call anytime.
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

stage gateway-start
systemctl daemon-reload
systemctl enable openclaw-gateway
systemctl start openclaw-gateway

# Wait for gateway to answer locally. Purely passive — the old loop
# forced a restart on every failed poll, which worked around the
# now-fixed first-boot config-rewrite cycle but actively interfered
# with a healthy-but-slow gateway startup.
for i in $(seq 1 30); do
    if curl -sf -o /dev/null http://127.0.0.1:18789; then
        echo "[bootstrap] gateway up after \${i}x 5s"
        break
    fi
    sleep 5
done

stage dns-wait
# DNS is written by the control-plane's provisionClawServer as soon as
# the provider hands us a real IP. We give it ~1 minute to show up at
# 1.1.1.1 before handing off to caddy — caddy's ACME flow has its own
# exponential backoff (up to ~3 days), so a slow propagation still
# resolves; the DNS wait is just to avoid burning the first attempt
# while the record is still being written.
echo "[bootstrap] waiting for DNS record for ${fullDomain}"
for i in $(seq 1 30); do
    if host ${fullDomain} 1.1.1.1 > /dev/null 2>&1; then
        echo "[bootstrap] DNS resolved after \${i}x 2s"
        break
    fi
    sleep 2
done

stage wizard
# Setup wizard — a simpler-than-Control-UI page at /myclaw/ that walks
# new users through model + telegram + wechat in 3 clicks. Static HTML
# + a tiny Node shim (server.mjs) running on loopback:18790, both
# fetched from the platform web app at provision time so we can iterate
# on the wizard without re-rendering every claw's cloud-init. Soft-fail
# like node_exporter — wizard is optional, claw works without it.
mkdir -p /etc/systemd/system/openclaw-gateway.service.d
(
    mkdir -p /var/www/myclaw /opt/myclaw-wizard
    with_retry curl -fsSL -o /var/www/myclaw/index.html https://myclaw.one/wizard/v1.html
    with_retry curl -fsSL -o /opt/myclaw-wizard/server.mjs https://myclaw.one/wizard/v1-server.mjs
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
    # Wait for shim to actually bind 18790 before letting Caddy take
    # traffic — Type=simple returns as soon as ExecStart fires, which
    # is ~500ms before node binds the socket. Without this, a request
    # arriving in that window 502s and the SPA shows "Reading your
    # config…" stuck forever.
    for i in $(seq 1 20); do ss -tln | grep -q :18790 && break; sleep 1; done
) || echo "[bootstrap] wizard setup failed; /myclaw/ will 404 on this claw — Control UI at / still works"

stage caddy
# Caddy auto-issues + auto-renews Let's Encrypt certs and reverse_proxy
# is WebSocket-aware by default, so the gateway terminal + live logs
# work end-to-end without explicit Upgrade/Connection headers. /metrics
# is gated by an exact Bearer-token match — first @metricsAuthed
# matcher wins and proxies to node_exporter on :9100, otherwise the
# fall-through @metrics matcher returns 401. /myclaw/api/* goes to the
# wizard shim, /myclaw/* serves the wizard SPA from disk, everything
# else falls through to the gateway / Control UI.
cat > /etc/caddy/Caddyfile << 'CADDYEOF'
{
    email ssl@${domain}
}

${fullDomain} {
    @metricsAuthed {
        path /metrics
        header Authorization "Bearer ${gatewayToken}"
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
    @rootRedirect {
        path /
        not header Upgrade *websocket*
    }
    redir @rootRedirect /myclaw/ 302
    reverse_proxy 127.0.0.1:18789
}
CADDYEOF
systemctl enable caddy
systemctl restart caddy

# Success marker. Everything reaching this point succeeded; the trap
# handler on failure rewrites this file with status=failed + stage.
echo "status=ok at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BOOTSTRAP_STATE"
echo "=== openclaw bootstrap finished at $(date -u) ==="
`
    return stripShellComments(script)
}

// Lightsail caps userData at 16 KB AFTER base64 encoding (not raw), so
// the effective raw-bytes budget is ~12 KB. Inline comments in the bash
// script are useful when we're reading source for maintenance, but they
// waste bytes at runtime — strip shell-comment-only lines and blank
// lines outside heredoc bodies. Heredoc bodies are left untouched since
// some of them contain Markdown (IDENTITY.md) where `#` is syntactically
// meaningful as an ATX header.
const stripShellComments = (script: string): string => {
    let heredocMarker: string | null = null
    const kept: string[] = []
    for (const line of script.split('\n')) {
        if (heredocMarker !== null) {
            kept.push(line)
            if (line.trim() === heredocMarker) heredocMarker = null
            continue
        }
        const heredocOpen = line.match(/<<\s*['"]?(\w+)['"]?\s*$/)
        if (heredocOpen) {
            heredocMarker = heredocOpen[1]
            kept.push(line)
            continue
        }
        if (line.startsWith('#!')) {
            kept.push(line)
            continue
        }
        if (/^\s*#/.test(line)) continue
        if (/^\s*$/.test(line)) continue
        kept.push(line)
    }
    return kept.join('\n')
}

export default generateCloudInit