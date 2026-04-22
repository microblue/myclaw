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
            // Every channel carries `enabled: true` explicitly so
            // openclaw's first-boot normalizer doesn't add it and
            // immediately rewrite the file (which triggers its own
            // config-watcher → SIGTERM → systemd restart cycle, 2-3
            // minutes of delay for every new user).
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
        lastTouchedVersion: '2026.4.19-beta.2',
        lastTouchedAt: '2026-04-01T00:00:00.000Z'
    }

    const configJson = JSON.stringify(config, null, 2)

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
# Single apt-get update covering both the base repos and (after the
# NodeSource repo is added below) the NodeSource apt source — we add
# the NodeSource file first, then update, to save a redundant pass.
mkdir -p /etc/apt/keyrings
with_retry curl -fsSL -o /etc/apt/keyrings/nodesource.gpg.key https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key
gpg --dearmor --batch --yes -o /etc/apt/keyrings/nodesource.gpg /etc/apt/keyrings/nodesource.gpg.key
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
with_retry apt-get update
with_retry apt-get install -y curl nginx certbot python3-certbot-nginx ufw ca-certificates gnupg git dnsutils nodejs

stage openclaw-install
# Pinned openclaw version. NOT @latest and NOT 2026.4.14/4.15 stable —
# those carry a regression (openclaw/openclaw #67575, #67698, #66833)
# where every OpenRouter turn returns \`payloads=0\`, so first chat on
# a fresh claw looks stuck. 2026.4.19-beta.2 is the first build that
# parses OpenRouter stream deltas correctly again. Bump this line once
# a stable ≥2026.4.19 ships.
#
# --prefer-offline: if npm already has tarballs cached, skip the HEAD
#   check round-trips (typically saves 10–30s on cold boots).
# --no-audit / --no-fund: cosmetic output; skip the registry round-trip
#   for vulnerability scan we'd ignore anyway on a single-package install.
with_retry npm install -g --prefer-offline --no-audit --no-fund openclaw@2026.4.19-beta.2

stage openclaw-user
if ! id openclaw >/dev/null 2>&1; then
    useradd -r -m -d /home/openclaw -s /bin/bash openclaw
fi
echo 'openclaw ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/openclaw

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

# myclaw-branded identity + session-start greeting. OpenClaw has no
# native greeting/suggestions config for the Control UI (verified
# against schema 2026.4.19-beta.2), so the rule lives here as a
# behavioral prompt the agent reads on every session startup.
cat > /home/openclaw/.openclaw/workspace/IDENTITY.md << 'IDEOF'
# IDENTITY.md — Who I am

- **Name:** Claw
- **Creature:** myclaw.one assistant — a private AI running on the user's own VPS
- **Vibe:** concise, resourceful, a little dry. Helpful without being sycophantic.
- **Emoji:** 🦞
- **Avatar:** https://myclaw.one/myclaw-logo.svg

I run on the user's personal myclaw.one claw. Everything stays on their box — their keys, their storage, their subscription.

## First turn in every new session

If the user's first message is empty, a bare greeting (hi / hello / 你好), or an unclear "what can you do?", open with a welcome card in their language:

> 👋 Welcome to your myclaw.one claw! I'm Claw 🦞 — your private AI on your own VPS. Everything we do here stays on your box.
>
> I can help with:
> - 📰 Summarize news or a URL
> - ✉️ Draft emails or messages
> - 🔎 Research a topic with sources
> - 💻 Write, review, or debug code
> - 🗓️ Plan a trip, project, or week
> - 💬 Just chat
>
> What would you like to work on?

If the first message is already a real task, skip the welcome and go straight into the work.
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
${llm?.openrouterApiKey ? `Environment=OPENROUTER_API_KEY=${llm.openrouterApiKey}\n` : ''}ExecStart=/usr/bin/openclaw gateway --port 18789 --bind loopback
Restart=always
RestartSec=10
StartLimitIntervalSec=0
StandardOutput=append:/var/log/openclaw-gateway.log
StandardError=append:/var/log/openclaw-gateway.log

[Install]
WantedBy=multi-user.target
SYSTEMD

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

cat > /etc/nginx/sites-available/openclaw << 'NGINXEOF'
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 444;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${fullDomain};

    location / {
        proxy_pass http://127.0.0.1:18789;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/openclaw /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
mkdir -p /etc/systemd/system/nginx.service.d
cat > /etc/systemd/system/nginx.service.d/override.conf << 'NGINXOVERRIDE'
[Service]
Restart=always
RestartSec=5
NGINXOVERRIDE
systemctl daemon-reload
nginx -t && systemctl reload nginx
systemctl enable nginx

stage dns-wait
# DNS is written by the control-plane's provisionClawServer as soon
# as the provider hands us a real IP — normally that lands in
# Cloudflare within a second or two, and 1.1.1.1 picks it up on the
# next TTL tick (60s). We poll up to 30x2s = 60s. If DNS never
# shows up in that window, fall through to certbot anyway; the
# certbot retry loop below absorbs brief delays.
echo "[bootstrap] waiting for DNS record for ${fullDomain}"
for i in $(seq 1 30); do
    if host ${fullDomain} 1.1.1.1 > /dev/null 2>&1; then
        echo "[bootstrap] DNS resolved after \${i}x 2s"
        break
    fi
    sleep 2
done

stage certbot
# Certbot retry loop. A single-shot call silently leaves nginx
# without a :443 listener if Let's Encrypt couldn't reach us
# (DNS still propagating, transient HTTP-01 failure, etc.), so
# retry a few times before giving up. After each failure we bounce
# nginx to clear any half-applied state.
cert_ok=0
for attempt in 1 2 3 4; do
    echo "[bootstrap] certbot attempt $attempt"
    if certbot --nginx -d ${fullDomain} --non-interactive --agree-tos --email ssl@${domain} --redirect; then
        cert_ok=1
        echo "[bootstrap] certbot attempt $attempt succeeded"
        break
    fi
    echo "[bootstrap] certbot attempt $attempt failed, sleeping 20s"
    systemctl reload nginx 2>/dev/null || true
    sleep 20
done
if [ "$cert_ok" -ne 1 ]; then
    echo "[bootstrap] ERROR: certbot exhausted retries; :443 is not available."
    echo "status=failed stage=certbot at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BOOTSTRAP_STATE"
    # Don't exit 1 — the VPS is otherwise healthy and the user can
    # manually re-run certbot once DNS sorts itself out. The sync
    # loop will flip the claw to \`unreachable\` after its timeout so
    # the dashboard surfaces the failure state.
fi

echo "0 0,12 * * * root certbot renew --quiet --deploy-hook 'systemctl reload nginx'" > /etc/cron.d/certbot-renew
chmod 644 /etc/cron.d/certbot-renew

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