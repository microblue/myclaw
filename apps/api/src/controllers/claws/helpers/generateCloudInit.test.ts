import { generateCloudInit } from '@/controllers/claws/helpers'

describe('generateCloudInit', () => {
    const output = generateCloudInit(
        'myP@ss123',
        'test-claw',
        'clawhost.cloud',
        'tok_abc123'
    )

    it('starts with a bash shebang so Lightsail + cloud-init treat it as a shell script', () => {
        expect(output.startsWith('#!/bin/bash')).toBe(true)
    })

    it('includes the root password', () => {
        expect(output).toContain("'myP@ss123'")
    })

    it('includes the full domain', () => {
        expect(output).toContain('test-claw.clawhost.cloud')
    })

    it('includes the gateway token in config', () => {
        expect(output).toContain('tok_abc123')
    })

    it('installs required packages', () => {
        expect(output).toContain('curl')
        expect(output).toContain('caddy')
        expect(output).toContain('ufw')
        expect(output).toContain('git')
        // nginx + certbot were replaced by caddy in v1.14
        expect(output).not.toContain('nginx')
        expect(output).not.toContain('certbot')
    })

    it('sets up systemd service', () => {
        expect(output).toContain('openclaw-gateway.service')
        expect(output).toContain('systemctl enable openclaw-gateway')
    })

    it('configures caddy reverse proxy to the gateway', () => {
        expect(output).toContain('reverse_proxy 127.0.0.1:18789')
    })

    it('enables firewall rules', () => {
        expect(output).toContain('ufw allow 22/tcp')
        expect(output).toContain('ufw allow 80/tcp')
        expect(output).toContain('ufw allow 443/tcp')
    })

    it('configures caddy auto-https with an email for ACME', () => {
        // Caddy auto-issues + auto-renews Let's Encrypt certs as long
        // as a global `email` is set. No certbot needed.
        expect(output).toMatch(/email ssl@[\w.]+/)
        expect(output).toContain('systemctl enable caddy')
    })

    it('includes swap setup', () => {
        expect(output).toContain('fallocate -l 2G /swapfile')
    })

    it('creates openclaw user', () => {
        expect(output).toContain('useradd -r -m -d /home/openclaw')
    })

    // The WebUI Update button needs the gateway (running as openclaw)
    // to own its own install prefix end-to-end — otherwise npm's
    // mkdtemp + symlink-swap hits EACCES inside /usr/lib/node_modules.
    // See generateCloudInit.ts for full background.
    it('installs openclaw under /opt/openclaw owned by the openclaw user', () => {
        expect(output).toContain('chown -R openclaw:openclaw /opt/openclaw')
        expect(output).toContain('sudo -u openclaw -H npm config set prefix /opt/openclaw')
        expect(output).toContain('ExecStart=/opt/openclaw/bin/openclaw gateway')
        // openclaw-user stage must run first so the install can sudo -u into it
        const userIdx = output.indexOf('stage openclaw-user')
        const installIdx = output.indexOf('stage openclaw-install')
        expect(userIdx).toBeGreaterThan(-1)
        expect(installIdx).toBeGreaterThan(userIdx)
    })

    // Overview tab's CPU / Memory / Disk tiles are sourced from a
    // node_exporter on each claw, gated through nginx by the gateway
    // token. See generateCloudInit.ts (`stage node-exporter`) for full
    // background.
    it('installs node_exporter and exposes /metrics gated by the gateway token', () => {
        expect(output).toContain('stage node-exporter')
        expect(output).toContain('useradd -r -s /usr/sbin/nologin node_exporter')
        expect(output).toContain('/opt/node_exporter/node_exporter')
        expect(output).toContain('--web.listen-address=127.0.0.1:9100')
        expect(output).toContain('systemctl enable node_exporter')
        // Caddy: first matcher requires path AND exact Bearer header
        // before reverse_proxy to node_exporter. Anything else on
        // /metrics falls through to a 401.
        expect(output).toContain('path /metrics')
        expect(output).toContain('header Authorization "Bearer tok_abc123"')
        expect(output).toContain('reverse_proxy 127.0.0.1:9100')
        expect(output).toContain('respond 401')
    })

    // silent-moth incident (2026-04-30): an unhandled failure inside
    // the node-exporter stage tripped `set -eu` and aborted the whole
    // bootstrap, so nginx + certbot never ran and the api flagged
    // the claw `unreachable`. Stage must be non-fatal: subshell so a
    // single failure stays inside, plus `||` to keep set -e happy.
    it('node-exporter stage is non-fatal so a download / start failure does not abort bootstrap', () => {
        // grab the slice from `stage node-exporter` to just before the
        // next stage and assert the soft-fail tail is in there
        const start = output.indexOf('stage node-exporter')
        const end = output.indexOf('stage openclaw-config')
        expect(start).toBeGreaterThan(-1)
        expect(end).toBeGreaterThan(start)
        const block = output.slice(start, end)
        // subshell is open at start, closed by `) ||`
        expect(block).toMatch(/\)\s*\|\|\s*echo/)
        // caddy stage must come after node-exporter so a failure here
        // cannot starve SSL issuance / reverse-proxy startup
        const caddyIdx = output.indexOf('stage caddy')
        expect(caddyIdx).toBeGreaterThan(end)
    })

    it('escapes the literal $ in the node_exporter systemd ExecStart so systemd does not try to expand it', () => {
        // `--collector.filesystem.mount-points-exclude=...($$|/)` —
        // systemd treats $X as env-var refs in Exec lines; the regex
        // we want is literal `($|/)`, so the unit file must encode it
        // as `($$|/)`.
        expect(output).toContain('mount-points-exclude=^/(dev|proc|sys|run|var/lib/docker|snap)($$|/)')
        // and the unescaped form must NOT be present
        expect(output).not.toContain('mount-points-exclude=^/(dev|proc|sys|run|var/lib/docker|snap)($|/)')
    })

    it('includes openclaw config JSON with tools defaults', () => {
        expect(output).toContain('"profile": "full"')
        expect(output).toContain('"host": "gateway"')
    })

    // ma4mzhe7 incident 2026-04-30: with default reload mode (`hybrid`)
    // openclaw's own writes to meta.lastTouchedAt fall through
    // BASE_RELOAD_RULES with no match → restartGateway=true →
    // gateway SIGTERMs itself every ~12 minutes, each restart
    // re-stages plugin runtime deps and pegs the event loop.
    it('disables openclaw config-watcher reload to break the self-restart loop', () => {
        expect(output).toContain('"reload"')
        expect(output).toMatch(/"reload":\s*\{[^}]*"mode":\s*"off"/s)
    })

    it('logs a bootstrap start banner', () => {
        expect(output).toContain('openclaw bootstrap starting')
    })

    it('pre-marks the agent workspace as setup-complete so onboarding is skipped', () => {
        expect(output).toContain(
            '/home/openclaw/.openclaw/workspace/.openclaw/workspace-state.json'
        )
        expect(output).toContain('"setupCompletedAt"')
        expect(output).toContain('"bootstrapSeededAt"')
    })

    // v1.17 reverts v1.16: channels must ship `enabled: true`.
    // openclaw's Control UI hides `enabled: false` channels from the
    // channels tab — disabled-by-default would mean users can't see
    // them to configure credentials. The 8s/15min health-monitor
    // spike that v1.16 was trying to suppress is cosmetic only.
    it('ships all built-in channels enabled so Control UI surfaces them', () => {
        const start = output.indexOf('"channels"')
        const end = output.indexOf('"commands"', start)
        expect(start).toBeGreaterThan(-1)
        expect(end).toBeGreaterThan(start)
        const channelsBlock = output.slice(start, end)
        for (const ch of ['whatsapp', 'telegram', 'discord', 'slack', 'signal']) {
            expect(channelsBlock).toContain(`"${ch}"`)
        }
        // 5 channels × 1 `"enabled": true` each
        const enabledMatches = channelsBlock.match(/"enabled":\s*true/g) || []
        expect(enabledMatches.length).toBe(5)
    })

    it('includes a `plugins.entries` block for built-in plugins', () => {
        expect(output).toContain('"plugins"')
        expect(output).toContain('"openrouter"')
    })

    it('includes a pre-populated `meta` block matching the pinned openclaw version', () => {
        expect(output).toContain('"meta"')
        expect(output).toContain('"lastTouchedVersion": "2026.4.11"')
        expect(output).toContain('"lastTouchedAt"')
    })

    describe('with openrouter llm config', () => {
        it('prefixes bare model slugs with "openrouter/" for agents.defaults.model.primary', () => {
            const out = generateCloudInit(
                'pw',
                'test',
                'example.com',
                'tok',
                {
                    openrouterApiKey: 'sk-or-v1-abc',
                    defaultModel: 'deepseek/deepseek-v3.2'
                }
            )
            expect(out).toContain('"primary": "openrouter/deepseek/deepseek-v3.2"')
            expect(out).not.toContain('"primary": "deepseek/deepseek-v3.2"')
        })

        it('writes OPENROUTER_API_KEY into the systemd unit so the built-in extension picks it up', () => {
            const out = generateCloudInit('pw', 'test', 'example.com', 'tok', {
                openrouterApiKey: 'sk-or-v1-abc',
                defaultModel: 'auto'
            })
            expect(out).toContain('Environment=OPENROUTER_API_KEY=sk-or-v1-abc')
        })

        it('falls back to openrouter/auto when no default model is saved', () => {
            const out = generateCloudInit('pw', 'test', 'example.com', 'tok', {
                openrouterApiKey: 'sk-or-v1-abc'
            })
            expect(out).toContain('"primary": "openrouter/auto"')
        })

        it('does not double-prefix already-qualified refs', () => {
            const out = generateCloudInit('pw', 'test', 'example.com', 'tok', {
                openrouterApiKey: 'sk-or-v1-abc',
                defaultModel: 'openrouter/anthropic/claude-sonnet-4'
            })
            expect(out).toContain('"primary": "openrouter/anthropic/claude-sonnet-4"')
            expect(out).not.toContain('openrouter/openrouter/')
        })

        it('omits OPENROUTER_API_KEY and model config when no api key is configured', () => {
            const out = generateCloudInit('pw', 'test', 'example.com', 'tok', {
                openrouterApiKey: null,
                defaultModel: null
            })
            expect(out).not.toContain('OPENROUTER_API_KEY')
            expect(out).not.toContain('"primary":')
        })
    })

    // v1.18 — setup wizard SPA at /myclaw/ on each claw, fronted by
    // Caddy. Static HTML + a Node shim on loopback:18790. Cloud-init
    // pulls both files from the platform web app at provision time.
    describe('setup wizard (/myclaw/)', () => {
        it('downloads the wizard SPA and shim from the platform web app', () => {
            expect(output).toContain('https://myclaw.one/wizard/v1.html')
            expect(output).toContain('https://myclaw.one/wizard/v1-server.mjs')
            expect(output).toContain('/var/www/myclaw/index.html')
            expect(output).toContain('/opt/myclaw-wizard/server.mjs')
        })

        it('writes a myclaw-wizard systemd unit running the shim as openclaw', () => {
            expect(output).toContain('myclaw-wizard.service')
            expect(output).toContain('ExecStart=/usr/bin/node /opt/myclaw-wizard/server.mjs')
            expect(output).toContain('User=openclaw')
            expect(output).toContain('systemctl enable myclaw-wizard')
            expect(output).toContain('systemctl start myclaw-wizard')
        })

        it('pre-creates the gateway systemd drop-in dir so the wizard can write OPENROUTER_API_KEY overrides', () => {
            expect(output).toContain(
                'mkdir -p /etc/systemd/system/openclaw-gateway.service.d'
            )
        })

        it('wizard stage is non-fatal so a download failure does not abort bootstrap', () => {
            const start = output.indexOf('stage wizard')
            const end = output.indexOf('stage caddy')
            expect(start).toBeGreaterThan(-1)
            expect(end).toBeGreaterThan(start)
            const block = output.slice(start, end)
            expect(block).toMatch(/\)\s*\|\|\s*echo/)
        })

        it('Caddy routes /myclaw/api/* to the shim and /myclaw/* to static files, before falling through to the gateway', () => {
            expect(output).toContain('@wizardApi path /myclaw/api/*')
            expect(output).toContain('reverse_proxy 127.0.0.1:18790')
            expect(output).toContain('@wizardStatic path /myclaw /myclaw/*')
            expect(output).toContain('root * /var/www')
            expect(output).toContain('file_server')
            // Order matters in the Caddyfile — named-matcher handles run
            // top-down, so the api matcher must come before the static
            // matcher (otherwise /myclaw/api/* would be served as a
            // file-not-found from /var/www), and both must come before
            // the catch-all gateway reverse_proxy.
            const apiIdx = output.indexOf('@wizardApi')
            const staticIdx = output.indexOf('@wizardStatic')
            const gwIdx = output.indexOf('reverse_proxy 127.0.0.1:18789')
            expect(apiIdx).toBeGreaterThan(-1)
            expect(staticIdx).toBeGreaterThan(apiIdx)
            expect(gwIdx).toBeGreaterThan(staticIdx)
        })
    })

    // v1.19 — root path redirects to /myclaw/ so the easy-setup wizard
    // is the default landing experience for fresh claws. WeChat plugin
    // is pre-installed so the wizard's WeChat page can show a QR scan
    // inline without making the user click "install" first.
    describe('easy-setup default landing (/myclaw/)', () => {
        it('seeds the openclaw-weixin plugin entry as enabled in openclaw.json', () => {
            expect(output).toContain('"openclaw-weixin"')
            // sit alongside openrouter + browser entries
            const start = output.indexOf('"plugins"')
            const end = output.indexOf('"meta"', start)
            expect(end).toBeGreaterThan(start)
            const block = output.slice(start, end)
            expect(block).toContain('"openclaw-weixin"')
            expect(block).toMatch(/"openclaw-weixin":\s*\{[^}]*"enabled":\s*true/s)
        })

        it('pre-installs the Tencent openclaw-weixin plugin in cloud-init', () => {
            expect(output).toContain('stage wechat-install')
            expect(output).toContain('plugins install @tencent-weixin/openclaw-weixin')
            // installs as the openclaw user so it lands in the openclaw
            // user's npm prefix + extensions dir (otherwise it would go
            // under root and the gateway couldn't load it)
            expect(output).toMatch(/sudo\s+-u\s+openclaw\s+-H\s+\/opt\/openclaw\/bin\/openclaw\s+plugins\s+install/)
        })

        it('wechat-install stage is non-fatal so a network blip doesnt abort bootstrap', () => {
            const start = output.indexOf('stage wechat-install')
            const end = output.indexOf('stage firewall')
            expect(start).toBeGreaterThan(-1)
            expect(end).toBeGreaterThan(start)
            const block = output.slice(start, end)
            expect(block).toMatch(/\)\s*\|\|\s*echo/)
        })

        it('Caddy 302-redirects domain root (/) to /myclaw/, but only for non-WebSocket requests', () => {
            expect(output).toContain('@rootRedirect')
            expect(output).toContain('not header Upgrade *websocket*')
            expect(output).toContain('redir @rootRedirect /myclaw/ 302')
            // The redirect must be before the catch-all reverse_proxy,
            // otherwise / falls through to gateway and never redirects.
            const redirIdx = output.indexOf('redir @rootRedirect')
            const gwIdx = output.indexOf('reverse_proxy 127.0.0.1:18789')
            expect(redirIdx).toBeGreaterThan(-1)
            expect(gwIdx).toBeGreaterThan(redirIdx)
        })
    })

    // ── Robustness harness ──
    describe('robustness hardening', () => {
        it('defines a with_retry helper and routes network fetches through it', () => {
            expect(output).toMatch(/^with_retry\(\)\s*\{/m)
            expect(output).toContain('with_retry apt-get update')
            expect(output).toContain('with_retry apt-get install -y curl')
            expect(output).toContain('with_retry sudo -u openclaw -H npm install -g')
        })

        it('picks Chrome build by dpkg architecture, falls back to chromium', () => {
            expect(output).toContain('dpkg --print-architecture')
            expect(output).toContain('google-chrome-stable_current_amd64.deb')
            expect(output).toContain('chromium')
        })

        it('writes a bootstrap state sentinel at /var/lib/openclaw-bootstrap/state', () => {
            expect(output).toContain('/var/lib/openclaw-bootstrap/state')
            expect(output).toContain('status=ok')
            expect(output).toContain('status=failed')
            expect(output).toContain('stage openclaw-install')
            expect(output).toContain('stage caddy')
        })

        it('firewall opens 22/80/443 before gateway + caddy start', () => {
            const fwIdx = output.indexOf('ufw allow 22/tcp')
            const gwIdx = output.indexOf('systemctl start openclaw-gateway')
            const caddyIdx = output.indexOf('systemctl restart caddy')
            expect(fwIdx).toBeGreaterThan(-1)
            expect(gwIdx).toBeGreaterThan(fwIdx)
            expect(caddyIdx).toBeGreaterThan(fwIdx)
        })

        it('gateway health poll is passive — no forced restart inside the loop', () => {
            // The old loop did `systemctl restart openclaw-gateway`
            // on every failed poll, which worked around a now-fixed
            // first-boot cycle but interfered with a healthy-but-slow
            // gateway startup. Ensure we don't reintroduce it.
            const pollSection = output.slice(
                output.indexOf('systemctl start openclaw-gateway'),
                output.indexOf('stage dns-wait')
            )
            expect(pollSection).not.toMatch(
                /systemctl restart openclaw-gateway/
            )
        })

        it('DNS wait is ~1 minute (30x2s), not the old 5-minute budget', () => {
            expect(output).toMatch(/for i in \$\(seq 1 30\); do\s+if host/)
            // The old 20s-extra-sleep after first resolve is gone.
            expect(output).not.toContain('20s for propagation')
        })

        it('drops the Homebrew background install', () => {
            expect(output).not.toContain('Homebrew')
            expect(output).not.toContain('install-brew.sh')
            expect(output).not.toContain('brew-install.log')
        })

        // silent-hare incident (2026-04-29): cloud-init crossed 16384
        // bytes after base64, AWS Lightsail rejected the createServer
        // call before allocating an IP — DB row stranded as
        // ip=NULL/provider_server_id=NULL/status=unreachable. Any future
        // bloat of this script must fail in CI, not in the field.
        it('rendered output stays under the AWS Lightsail userData base64 cap', () => {
            const b64Bytes = Buffer.from(output, 'utf8').toString('base64')
                .length
            expect(b64Bytes).toBeLessThan(16384)
        })
    })
})