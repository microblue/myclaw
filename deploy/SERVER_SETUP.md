# MyClaw Server Setup — Lightsail

One-time manual steps on the Lightsail box before CI/CD (`.github/workflows/deploy.yml`) can deploy.

## 1. Prerequisites on the server

```bash
# Node 20 + pnpm
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git
sudo corepack enable
sudo corepack prepare pnpm@10.29.3 --activate

# passwordless sudo for systemctl restart/reload (so deploy.sh doesn't prompt)
echo 'ubuntu ALL=(ALL) NOPASSWD: /bin/systemctl restart myclaw-api, /bin/systemctl reload nginx' \
  | sudo tee /etc/sudoers.d/myclaw-deploy
sudo chmod 440 /etc/sudoers.d/myclaw-deploy
```

## 2. Clone repo and set env files

```bash
cd ~
git clone https://github.com/microblue/myclaw.git
cd myclaw
pnpm install --frozen-lockfile

# api env — see CLAWHOST_DEPLOY.md for full template
vim apps/api/.env

# web env — VITE_* vars are baked in at `pnpm --filter web build` time
vim apps/web/.env.production
```

## 3. Install systemd unit

```bash
sudo cp deploy/myclaw-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable myclaw-api
sudo systemctl start myclaw-api
sudo systemctl status myclaw-api
```

## 4. Install nginx config

```bash
# Edit SERVER_NAME first!
sudo cp deploy/nginx.conf /etc/nginx/sites-available/myclaw
sudo sed -i "s/SERVER_NAME/your.domain.com/" /etc/nginx/sites-available/myclaw
sudo ln -sf /etc/nginx/sites-available/myclaw /etc/nginx/sites-enabled/myclaw
sudo nginx -t
sudo systemctl reload nginx

# Optional: TLS via certbot
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your.domain.com
```

## 5. First build

```bash
cd ~/myclaw
pnpm --filter web build
```

After this, web is served from `~/myclaw/apps/web/dist` by nginx.

## 6. GitHub Actions secrets

In the `microblue/myclaw` repo → Settings → Secrets and variables → Actions, add:

| Secret | Value |
|---|---|
| `LIGHTSAIL_HOST` | `54.202.132.115` (or your DNS name) |
| `LIGHTSAIL_USER` | `ubuntu` |
| `LIGHTSAIL_SSH_KEY` | contents of the private key that pairs with `~/.ssh/authorized_keys` on the server |

To generate a dedicated deploy key (recommended — don't reuse your personal key):

```bash
# on your laptop
ssh-keygen -t ed25519 -f ~/.ssh/myclaw-deploy -C "github-actions-deploy" -N ""
ssh-copy-id -i ~/.ssh/myclaw-deploy.pub ubuntu@54.202.132.115
cat ~/.ssh/myclaw-deploy   # paste into LIGHTSAIL_SSH_KEY secret
```

## 7. Database migrations

**Not** run automatically by the deploy workflow — they are explicit, run manually:

```bash
ssh ubuntu@54.202.132.115
cd ~/myclaw
pnpm --filter api db:migrate
```

## 8. Trigger a deploy

- Push to `main` → workflow runs automatically.
- Or: GitHub → Actions → "Deploy to Lightsail" → Run workflow.
