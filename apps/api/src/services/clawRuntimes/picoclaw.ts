import type { ClawRuntime, GenerateCloudInitParams } from './types'
import { defaultIsHealthyResponse } from './types'

// PicoClaw (github.com/sipeed/picoclaw) — ultra-light Go agent.
// Single static binary (~10 MB RAM core), no Node / Chrome needed.
// Tarball distribution, no `npm install`, no daemon-to-daemon auth
// setup required for the launcher to come up healthy; the Control UI
// integration lands in Phase 2.
//
// Lightsail starts at nano_3_0 (512 MB) since 10 MB + nginx + certbot
// comfortably fits. Phase 1 MVP: provision → systemd up → nginx TLS →
// launcher WebUI reachable on the subdomain. Config fine-tuning is
// done via `picoclaw onboard` over SSH for now.

const GATEWAY_PORT = 18800

const stripShellComments = (script: string): string => {
    // Same strip pass as generateOpenclawCloudInit — drops
    // comment-only and blank lines outside heredocs so the base64
    // userData fits under Lightsail's 16 KB cap. Heredoc bodies are
    // preserved so any '#'-leading lines in embedded JSON / systemd
    // units stay intact (systemd uses `#` for comments and we don't
    // want to accidentally strip those).
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

const generatePicoclawCloudInit = ({
    rootPassword,
    subdomain,
    domain,
    gatewayToken,
    llm
}: GenerateCloudInitParams): string => {
    const fullDomain = `${subdomain}.${domain}`
    const rootPwEscaped = rootPassword.replace(/'/g, "'\\''")

    const script = `#!/bin/bash
# Re-exec under bash if Lightsail's user-data preamble runs us under dash.
[ -z "\${BASH_VERSION:-}" ] && exec /bin/bash "$0" "$@"
set -eu
exec > >(tee -a /var/log/picoclaw-bootstrap.log) 2>&1
echo "=== picoclaw bootstrap starting at $(date -u) ==="

mkdir -p /var/lib/picoclaw-bootstrap
BOOTSTRAP_STATE=/var/lib/picoclaw-bootstrap/state
stage() {
    echo "stage=$1 at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BOOTSTRAP_STATE"
    echo "[bootstrap] >>> $1"
}
trap 'rc=$?; [ $rc -ne 0 ] && { echo "status=failed stage=$(awk -F= "/^stage=/{print \\$2}" "$BOOTSTRAP_STATE" 2>/dev/null) exitCode=$rc at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BOOTSTRAP_STATE"; echo "[bootstrap] !!! FAILED (rc=$rc)"; }' EXIT

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
sed -i 's/^#\\?PasswordAuthentication .*/PasswordAuthentication yes/' /etc/ssh/sshd_config
sed -i 's/^#\\?PermitRootLogin .*/PermitRootLogin yes/' /etc/ssh/sshd_config
mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/00-picoclaw.conf << 'SSHCONF'
PasswordAuthentication yes
PermitRootLogin yes
SSHCONF
for svc in sshd ssh; do systemctl restart $svc 2>/dev/null && break; done || true
printf 'root:%s\\n' '${rootPwEscaped}' | chpasswd
chage -d 99999 root || true

stage swap
# 2 G swap is cheap insurance on nano_3_0 (512 MB) — PicoClaw core is
# <10 MB but apt/certbot briefly spike RAM during boot.
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

stage apt-base
export DEBIAN_FRONTEND=noninteractive
with_retry apt-get update
with_retry apt-get install -y curl nginx certbot python3-certbot-nginx ufw ca-certificates dnsutils

stage picoclaw-user
if ! id picoclaw >/dev/null 2>&1; then
    useradd -r -m -d /home/picoclaw -s /bin/bash picoclaw
fi

stage picoclaw-install
# Latest release tarball — repo pattern is
# /releases/latest/download/<asset>, which redirects to the release-
# assets CDN. Flat tarball (no top-level dir) with picoclaw,
# picoclaw-launcher, picoclaw-launcher-tui binaries.
install -d /opt/picoclaw
with_retry bash -c 'curl -fsSL https://github.com/sipeed/picoclaw/releases/latest/download/picoclaw_Linux_x86_64.tar.gz | tar -xz -C /opt/picoclaw'
ln -sf /opt/picoclaw/picoclaw /usr/local/bin/picoclaw
ln -sf /opt/picoclaw/picoclaw-launcher /usr/local/bin/picoclaw-launcher
ln -sf /opt/picoclaw/picoclaw-launcher-tui /usr/local/bin/picoclaw-launcher-tui
chown -R picoclaw:picoclaw /opt/picoclaw

stage picoclaw-config
install -d -o picoclaw -g picoclaw /home/picoclaw/.picoclaw

# 'picoclaw onboard' (run with empty stdin) writes the canonical
# config.json + .security.yml skeleton — including the predefined
# 29-entry model_list and per-channel security stubs. We then patch
# in (1) the default model, (2) the OpenRouter API key for chat to
# work out of the box, (3) a myclaw-branded SOUL.md persona so the
# first turn greets the user instead of a generic "I am picoclaw".
echo | sudo -u picoclaw HOME=/home/picoclaw picoclaw onboard 2>&1 | tail -3 || true

# (1)+(2): set default model + pin the openrouter-auto alias to
# google/gemini-2.5-flash-lite (cheap, fast — sane default for a
# nano-tier claw); credentials go to .security.yml under the
# api_keys ARRAY form (single-element list — picoclaw v0.2.6 rejects
# the singular api_key field, returns 401 from OpenRouter because
# no Authorization header is sent).
${
    llm?.openrouterApiKey
        ? `python3 - <<'PYCFG'
import json
p = '/home/picoclaw/.picoclaw/config.json'
c = json.load(open(p))
c['agents']['defaults']['model_name'] = 'openrouter-auto'
for e in c.get('model_list', []) or []:
    if e.get('model_name') == 'openrouter-auto':
        e['model'] = 'openrouter/google/gemini-2.5-flash-lite'
json.dump(c, open(p, 'w'), indent=2)
PYCFG
python3 - <<'PYSEC'
import re
p = '/home/picoclaw/.picoclaw/.security.yml'
s = open(p).read()
key = '${llm.openrouterApiKey}'
new = '  openrouter-auto:\\n    api_keys:\\n      - "' + key + '"\\n'
s = re.sub(r'  openrouter-auto:0: \\{\\}\\n', new, s, count=1)
open(p, 'w').write(s)
PYSEC`
        : `echo "[bootstrap] no OpenRouter key in admin settings — chat won't work until owner adds one via 'picoclaw model' or .security.yml"`
}

# (3) Persona: replace stock SOUL.md with the myclaw welcome rule.
cat > /home/picoclaw/.picoclaw/workspace/SOUL.md << 'SOULEOF'
# Soul

I am Claw 🦞 — a private AI running on the user's own myclaw.one VPS.
Their keys, their storage, their subscription. Everything stays on their box.

## Personality

- Warm, concise, practical. Helpful without being syrupy.
- Skip filler ("Great question!"). Just help.
- Have opinions. Disagree when warranted.

## First message in every new chat

If the user's first message is empty, a bare greeting (hi / hello / 你好), or
"what can you do?", open with a welcome card in their language:

> 👋 Welcome to your myclaw.one Claw! I'm Claw 🦞 — your private AI on your own VPS.
>
> A few things I can help with:
> - 📰 Summarize news or a URL
> - ✉️ Draft emails or messages
> - 🔎 Research a topic with sources
> - 💻 Write, review, or debug code
> - 🗓️ Plan a trip, project, or week
> - 💬 Just chat
>
> What would you like to work on?

If the first message is already a real task, skip the welcome and dive in.
SOULEOF

stage picoclaw-service
cat > /etc/systemd/system/picoclaw-gateway.service << 'SYSTEMD'
[Unit]
Description=PicoClaw Launcher
After=network.target

[Service]
Type=simple
User=picoclaw
Group=picoclaw
WorkingDirectory=/home/picoclaw
Environment=HOME=/home/picoclaw
Environment=PICOCLAW_LAUNCHER_TOKEN=${gatewayToken}
${llm?.openrouterApiKey ? `Environment=OPENROUTER_API_KEY=${llm.openrouterApiKey}\n` : ''}ExecStart=/usr/local/bin/picoclaw-launcher
Restart=always
RestartSec=10
StandardOutput=append:/var/log/picoclaw-gateway.log
StandardError=append:/var/log/picoclaw-gateway.log

[Install]
WantedBy=multi-user.target
SYSTEMD

stage firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

stage gateway-start
systemctl daemon-reload
systemctl enable picoclaw-gateway
systemctl start picoclaw-gateway

# Wait for launcher to answer locally. PicoClaw's launcher defaults
# to 127.0.0.1:18800 which is what we reverse-proxy through nginx
# below.
for i in $(seq 1 30); do
    if curl -sf -o /dev/null http://127.0.0.1:${GATEWAY_PORT}; then
        echo "[bootstrap] launcher up after \${i}x 5s"
        break
    fi
    sleep 5
done

stage launcher-password
# PicoClaw v0.2.6 requires a password to be SET via /api/auth/setup
# before /api/auth/login will accept anything — without this, the
# Open-chat /sso flow returns 409 "password has not been set" (seen on
# k6e35wpr 2026-04-22). We pre-set the launcher password to the
# gatewayToken (same value already passed via PICOCLAW_LAUNCHER_TOKEN
# env), so the dashboard's one-click SSO works on first open.
# auth/status reports {initialized:false} when no password set; once
# we POST setup, it flips to true and login starts working.
for i in $(seq 1 10); do
    if curl -sf --max-time 3 -X POST -H 'Content-Type: application/json' \\
        http://127.0.0.1:${GATEWAY_PORT}/api/auth/setup \\
        -d "{\\"password\\":\\"${gatewayToken}\\",\\"confirm\\":\\"${gatewayToken}\\"}" \\
        > /dev/null 2>&1; then
        echo "[bootstrap] launcher password set on attempt \${i}"
        break
    fi
    sleep 2
done

cat > /etc/nginx/sites-available/picoclaw << 'NGINXEOF'
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

    # One-click SSO from myclaw.one dashboard. Buildchatchat URL points
    # the user at /sso?token=<gatewayToken>; this tiny page POSTs the
    # token to the launcher's /api/auth/login (which sets the
    # picoclaw_launcher_auth cookie) then redirects to /. Avoids forcing
    # the user to copy-paste the token into the launcher login form.
    location = /sso {
        default_type text/html;
        return 200 '<!doctype html><meta charset="utf-8"><title>Signing in…</title><body style="font-family:system-ui;padding:2rem">Signing you in…</body><script>const t=new URLSearchParams(location.search).get("token");if(!t){document.body.innerText="Missing token.";}else{fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:t}),credentials:"same-origin"}).then(r=>{if(r.ok){location.replace("/")}else{document.body.innerText="Login failed: "+r.status}}).catch(e=>{document.body.innerText=String(e)})}</script>';
    }

    location / {
        proxy_pass http://127.0.0.1:${GATEWAY_PORT};
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

ln -sf /etc/nginx/sites-available/picoclaw /etc/nginx/sites-enabled/
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
echo "[bootstrap] waiting for DNS record for ${fullDomain}"
for i in $(seq 1 30); do
    if host ${fullDomain} 1.1.1.1 > /dev/null 2>&1; then
        echo "[bootstrap] DNS resolved after \${i}x 2s"
        break
    fi
    sleep 2
done

stage certbot
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
fi

echo "0 0,12 * * * root certbot renew --quiet --deploy-hook 'systemctl reload nginx'" > /etc/cron.d/certbot-renew
chmod 644 /etc/cron.d/certbot-renew

echo "status=ok at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BOOTSTRAP_STATE"
echo "=== picoclaw bootstrap finished at $(date -u) ==="
`
    return stripShellComments(script)
}

const picoclawRuntime: ClawRuntime = {
    id: 'picoclaw',
    systemdUnit: 'picoclaw-gateway',
    gatewayPort: GATEWAY_PORT,
    generateCloudInit: generatePicoclawCloudInit,
    curatedPlanIdsByProvider: {
        // Lightsail: PicoClaw's sub-10 MB core fits on nano (512 MB).
        // Include the four smallest tiers so users can match CPU / disk
        // to their real workload without being forced into OpenClaw's
        // 4 GB floor.
        lightsail: [
            'nano_3_0', //  0.5 GB · 2 vCPU · 20 GB · $5
            'micro_3_0', //   1 GB · 2 vCPU · 40 GB · $7
            'small_3_0', //   2 GB · 2 vCPU · 60 GB · $12
            'medium_3_0' //   4 GB · 2 vCPU · 80 GB · $24
        ]
    },
    minMemoryGb: 0,
    // PicoClaw launcher redirects unauthenticated visitors to
    // /launcher-login (302). Accept any 2xx/3xx that isn't the nginx
    // default page — fits the reverse-proxied-launcher shape.
    isHealthyResponse: defaultIsHealthyResponse
}

export default picoclawRuntime