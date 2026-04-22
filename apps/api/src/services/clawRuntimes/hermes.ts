import type { ClawRuntime, GenerateCloudInitParams } from './types'
import { defaultIsHealthyResponse } from './types'

// Hermes Agent (github.com/NousResearch/hermes-agent) — Python project
// in the OpenClaw lineage. Long-running gateway daemon for messaging
// platforms; ALSO ships a built-in web chat UI (`hermes web`) so we
// don't need to front it with Open WebUI like we did for OpenClaw.
//
// Footprint: Python 3.11 + uv venv with [all] extras → ~1.5-2 GB disk,
// 250-400 MB RAM idle, 600 MB+ during a turn. Lightsail nano (512 MB)
// will OOM, so the curated plans floor is micro_3_0 (1 GB).

const WEB_PORT = 9119

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

const generateHermesCloudInit = ({
    rootPassword,
    subdomain,
    domain,
    llm
}: GenerateCloudInitParams): string => {
    const fullDomain = `${subdomain}.${domain}`
    const rootPwEscaped = rootPassword.replace(/'/g, "'\\''")

    const script = `#!/bin/bash
[ -z "\${BASH_VERSION:-}" ] && exec /bin/bash "$0" "$@"
set -eu
exec > >(tee -a /var/log/hermes-bootstrap.log) 2>&1
echo "=== hermes bootstrap starting at $(date -u) ==="

mkdir -p /var/lib/hermes-bootstrap
BOOTSTRAP_STATE=/var/lib/hermes-bootstrap/state
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
cat > /etc/ssh/sshd_config.d/00-hermes.conf << 'SSHCONF'
PasswordAuthentication yes
PermitRootLogin yes
SSHCONF
for svc in sshd ssh; do systemctl restart $svc 2>/dev/null && break; done || true
printf 'root:%s\\n' '${rootPwEscaped}' | chpasswd
chage -d 99999 root || true

stage swap
# 2 G swap critical on micro_3_0 (1 GB) — Hermes turn can spike to
# 600 MB and would OOM without swap headroom.
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

stage apt-base
export DEBIAN_FRONTEND=noninteractive
# Node 22 from NodeSource — Ubuntu 24's apt nodejs is 18.x and Vite
# (which builds Hermes' web dashboard) ESM-loads its config.js using
# Node 20+ APIs, so the in-distro version errors out at first launch.
mkdir -p /etc/apt/keyrings
with_retry curl -fsSL -o /etc/apt/keyrings/nodesource.gpg.key https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key
gpg --dearmor --batch --yes -o /etc/apt/keyrings/nodesource.gpg /etc/apt/keyrings/nodesource.gpg.key
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
with_retry apt-get update
with_retry apt-get install -y curl nginx certbot python3-certbot-nginx ufw ca-certificates dnsutils python3 python3-venv git build-essential nodejs

stage hermes-user
if ! id hermes >/dev/null 2>&1; then
    useradd -r -m -d /home/hermes -s /bin/bash hermes
fi

stage hermes-install
# Official one-liner. Installs uv, clones repo to ~/.hermes/hermes-agent,
# builds python 3.11 venv with [all] extras, symlinks ~/.local/bin/hermes.
# Run as hermes user so all artifacts land in $HOME/.hermes/.
sudo -u hermes -H bash -c 'curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | HERMES_NO_PROMPT=1 bash' || true
ln -sf /home/hermes/.local/bin/hermes /usr/local/bin/hermes 2>/dev/null || true

stage hermes-web-build
# pip install of hermes does NOT bundle the web dashboard's frontend
# (only the Docker image does). hermes dashboard will try to npm
# install + vite build on first launch — too slow for a service unit
# and prone to error storms on restart. Build it explicitly here.
cd /home/hermes/.hermes/hermes-agent/web
sudo -u hermes -H npm install 2>&1 | tail -3 || true
sudo -u hermes -H npm run build 2>&1 | tail -3 || true
cd -

stage hermes-config
# Pre-seed OpenRouter key in .env + non-interactive model selection +
# myclaw welcome persona, so the user lands in the web UI with a
# usable model and a friendly first message.
${
    llm?.openrouterApiKey
        ? `cat > /home/hermes/.hermes/.env << 'ENVEOF'
OPENROUTER_API_KEY=${llm.openrouterApiKey}
ENVEOF
chown hermes:hermes /home/hermes/.hermes/.env
chmod 600 /home/hermes/.hermes/.env
sudo -u hermes -H /usr/local/bin/hermes config set model.provider openrouter || true
sudo -u hermes -H /usr/local/bin/hermes config set model.default google/gemini-2.5-flash-lite || true
sudo -u hermes -H /usr/local/bin/hermes config set model.base_url https://openrouter.ai/api/v1 || true`
        : `echo "[bootstrap] no OpenRouter key in admin settings — chat won't work until owner runs 'hermes config set' over SSH"`
}

cat > /home/hermes/.hermes/SOUL.md << 'SOULEOF'
I am Claw 🦞 — a private AI running on the user's own myclaw.one VPS.
Their keys, their storage, their subscription. Everything stays on their box.

# Personality
Warm, concise, practical. Helpful without being syrupy. Skip filler
("Great question!"). Have opinions. Disagree when warranted.

# First message in every new chat
If the user's first message is empty, a bare greeting (hi / hello / 你好),
or "what can you do?", open with a welcome card in their language:

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
chown hermes:hermes /home/hermes/.hermes/SOUL.md

stage hermes-service
cat > /etc/systemd/system/hermes-web.service << 'SYSTEMD'
[Unit]
Description=Hermes Agent web UI
After=network.target
[Service]
Type=simple
User=hermes
Group=hermes
WorkingDirectory=/home/hermes
Environment=HOME=/home/hermes
ExecStart=/usr/local/bin/hermes dashboard --no-open --host 127.0.0.1 --port ${WEB_PORT}
Restart=always
RestartSec=10
StandardOutput=append:/var/log/hermes-web.log
StandardError=append:/var/log/hermes-web.log
[Install]
WantedBy=multi-user.target
SYSTEMD

stage firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

stage web-start
systemctl daemon-reload
systemctl enable hermes-web
systemctl start hermes-web
for i in $(seq 1 30); do
    if curl -sf -o /dev/null http://127.0.0.1:${WEB_PORT}; then
        echo "[bootstrap] hermes web up after \${i}x 5s"
        break
    fi
    sleep 5
done

cat > /etc/nginx/sites-available/hermes << 'NGINXEOF'
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
        proxy_pass http://127.0.0.1:${WEB_PORT};
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
ln -sf /etc/nginx/sites-available/hermes /etc/nginx/sites-enabled/
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
    echo "[bootstrap] ERROR: certbot exhausted retries"
    echo "status=failed stage=certbot at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BOOTSTRAP_STATE"
fi

echo "0 0,12 * * * root certbot renew --quiet --deploy-hook 'systemctl reload nginx'" > /etc/cron.d/certbot-renew
chmod 644 /etc/cron.d/certbot-renew

echo "status=ok at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BOOTSTRAP_STATE"
echo "=== hermes bootstrap finished at $(date -u) ==="
`
    return stripShellComments(script)
}

const hermesRuntime: ClawRuntime = {
    id: 'hermes',
    systemdUnit: 'hermes-web',
    gatewayPort: WEB_PORT,
    generateCloudInit: generateHermesCloudInit,
    curatedPlanIdsByProvider: {
        // Lightsail: floor at micro_3_0 (1 GB) — nano OOM-thrashes on
        // the Python venv. small_3_0 (2 GB) is the comfortable default;
        // medium_3_0 (4 GB) for users who want headroom for big turns.
        lightsail: ['micro_3_0', 'small_3_0', 'medium_3_0', 'large_3_0']
    },
    minMemoryGb: 1,
    isHealthyResponse: defaultIsHealthyResponse
}

export default hermesRuntime