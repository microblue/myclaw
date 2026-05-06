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
[ -z "\${BASH_VERSION:-}" ] && exec /bin/bash "$0" "$@"
set -eu
exec > >(tee -a /var/log/openclaw-bootstrap.log) 2>&1
echo "=== openclaw bootstrap starting at $(date -u) ==="

mkdir -p /var/lib/openclaw-bootstrap
BOOTSTRAP_STATE=/var/lib/openclaw-bootstrap/state
stage() {
    echo "stage=$1 at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BOOTSTRAP_STATE"
    echo "[oc] >>> $1"
}
trap 'rc=$?; [ $rc -ne 0 ] && { S=$(awk -F= "/^stage=/{print \\$2}" "$BOOTSTRAP_STATE" 2>/dev/null); echo "status=failed stage=$S rc=$rc" > "$BOOTSTRAP_STATE"; echo "[oc] FAILED stage=$S rc=$rc"; }' EXIT

with_retry() {
    local attempts=5 delay=3 i=1
    while true; do
        if "$@"; then return 0; fi
        if [ $i -ge $attempts ]; then
            echo "[oc] retry exhausted ($attempts): $*"
            return 1
        fi
        echo "[oc] attempt $i/$attempts failed, sleep \${delay}s: $*"
        sleep $delay
        delay=$((delay * 2))
        i=$((i + 1))
    done
}

stage sshd-config
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
    arm64)
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

stage openclaw-config
mkdir -p /home/openclaw/.openclaw/agents/main/agent
cat > /home/openclaw/.openclaw/openclaw.json << 'OCCONFIG'
${configJson}
OCCONFIG

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

stage version-watcher
(curl -fsSL https://myclaw.one/oc-watcher.sh|bash) || echo "[oc] watcher install failed"

stage greatlove-install
(
    with_retry curl -fsSL -o /tmp/gl.tgz https://myclaw.one/downloads/greatlove-openclaw-plugin-1.0.0.tgz
    with_retry sudo -u openclaw -H /opt/openclaw/bin/openclaw plugins install /tmp/gl.tgz
) || echo "[oc] greatlove plugin install failed"

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
        echo "[oc] gateway up after \${i}x 5s"
        break
    fi
    sleep 5
done

stage dns-wait
echo "[oc] waiting for DNS record for ${fullDomain}"
for i in $(seq 1 30); do
    if host ${fullDomain} 1.1.1.1 > /dev/null 2>&1; then
        echo "[oc] DNS resolved after \${i}x 2s"
        break
    fi
    sleep 2
done

stage wizard
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
    for i in $(seq 1 20); do ss -tln | grep -q :18790 && break; sleep 1; done
) || echo "[oc] wizard setup failed; /myclaw/ will 404 on this claw — Control UI at / still works"

stage caddy
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
Environment=GATEWAY_TOKEN=${gatewayToken}
ExecStart=/bin/bash -c "curl -fsSL https://${domain}/api/cloud-scripts/install-studio|bash"
[Install]
WantedBy=multi-user.target
EOF
systemctl enable oc-stu-i.service

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