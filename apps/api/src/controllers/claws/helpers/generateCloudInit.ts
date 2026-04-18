import applyToolsDefaults from '@/controllers/claws/helpers/applyToolsDefaults'
import OPENCLAW_VERSION from '@/controllers/claws/helpers/openclawVersion'

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
    gatewayToken: string
): string => {
    const fullDomain = `${subdomain}.${domain}`
    const config: Record<string, unknown> = {
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
            trustedProxies: ['127.0.0.1', '::1']
        },
        channels: {
            whatsapp: { dmPolicy: 'open', allowFrom: ['*'] },
            telegram: { dmPolicy: 'open', allowFrom: ['*'] },
            discord: {},
            slack: {},
            signal: { dmPolicy: 'open', allowFrom: ['*'] }
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
        }
    }

    applyToolsDefaults(config)
    config.agents = { defaults: { sandbox: { mode: 'off' } } }

    const configJson = JSON.stringify(config, null, 2)

    // Root password injected via printf %s to survive any shell
    // metacharacters in the generated password.
    const rootPwEscaped = rootPassword.replace(/'/g, "'\\''")

    return `#!/bin/bash
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

# Enable SSH password auth + set root password
sed -i 's/^#\\?PasswordAuthentication .*/PasswordAuthentication yes/' /etc/ssh/sshd_config
for svc in sshd ssh; do systemctl restart $svc 2>/dev/null && break; done || true
printf 'root:%s\\n' '${rootPwEscaped}' | chpasswd
chage -d 99999 root || true

# 2G swap
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Base packages
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl nginx certbot python3-certbot-nginx ufw ca-certificates gnupg git dnsutils

# Node.js 22 via NodeSource
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
apt-get update
apt-get install -y nodejs
npm install -g openclaw@${OPENCLAW_VERSION}

# openclaw system user
if ! id openclaw >/dev/null 2>&1; then
    useradd -r -m -d /home/openclaw -s /bin/bash openclaw
fi
echo 'openclaw ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/openclaw

# Chrome (for browser tool)
wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -O /tmp/google-chrome.deb
dpkg -i /tmp/google-chrome.deb || apt-get install -f -y
rm -f /tmp/google-chrome.deb

# OpenClaw config
mkdir -p /home/openclaw/.openclaw/agents/main/agent
cat > /home/openclaw/.openclaw/openclaw.json << 'OCCONFIG'
${configJson}
OCCONFIG
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
ExecStart=/usr/bin/openclaw gateway --port 18789 --bind loopback
Restart=always
RestartSec=10
StartLimitIntervalSec=0
StandardOutput=append:/var/log/openclaw-gateway.log
StandardError=append:/var/log/openclaw-gateway.log

[Install]
WantedBy=multi-user.target
SYSTEMD

systemctl daemon-reload
systemctl enable openclaw-gateway
systemctl start openclaw-gateway

# Wait for gateway to answer locally (kick if slow to boot)
for i in $(seq 1 30); do
    if curl -sf -o /dev/null http://127.0.0.1:18789; then break; fi
    systemctl restart openclaw-gateway 2>/dev/null || true
    sleep 10
done

# Firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# nginx reverse proxy → OpenClaw gateway
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

# Wait for DNS propagation (Cloudflare A record written by the control
# plane before createServer) and then hand nginx to certbot for HTTPS.
for i in $(seq 1 24); do
    if host ${fullDomain} 1.1.1.1 > /dev/null 2>&1; then
        sleep 15
        break
    fi
    sleep 5
done
certbot --nginx -d ${fullDomain} --non-interactive --agree-tos --email ssl@${domain} --redirect || true

echo "0 0,12 * * * root certbot renew --quiet --deploy-hook 'systemctl reload nginx'" > /etc/cron.d/certbot-renew
chmod 644 /etc/cron.d/certbot-renew

# Homebrew for the openclaw user (background — lets bootstrap finish
# fast and the user gets brew later)
cat > /tmp/install-brew.sh << 'BREWSCRIPT'
#!/bin/bash
su - openclaw -c 'NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"' >> /home/openclaw/.bashrc
BREWSCRIPT
chmod +x /tmp/install-brew.sh
nohup /tmp/install-brew.sh > /var/log/brew-install.log 2>&1 &

echo "=== openclaw bootstrap finished at $(date -u) ==="
`
}

export default generateCloudInit