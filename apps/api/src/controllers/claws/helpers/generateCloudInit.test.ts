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
        expect(output).toContain('nginx')
        expect(output).toContain('certbot')
        expect(output).toContain('ufw')
        expect(output).toContain('git')
    })

    it('sets up systemd service', () => {
        expect(output).toContain('openclaw-gateway.service')
        expect(output).toContain('systemctl enable openclaw-gateway')
    })

    it('configures nginx reverse proxy', () => {
        expect(output).toContain('proxy_pass http://127.0.0.1:18789')
    })

    it('enables firewall rules', () => {
        expect(output).toContain('ufw allow 22/tcp')
        expect(output).toContain('ufw allow 80/tcp')
        expect(output).toContain('ufw allow 443/tcp')
    })

    it('sets up certbot SSL', () => {
        expect(output).toContain('certbot --nginx')
        expect(output).toContain('certbot renew')
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
        // nginx /metrics location with Bearer-token check on gatewayToken
        expect(output).toContain('location = /metrics')
        expect(output).toContain('Bearer tok_abc123')
        expect(output).toContain('proxy_pass http://127.0.0.1:9100/metrics')
    })

    it('includes openclaw config JSON with tools defaults', () => {
        expect(output).toContain('"profile": "full"')
        expect(output).toContain('"host": "gateway"')
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

    // These three shapes are what openclaw's first-boot normalizer
    // would otherwise add, triggering a file rewrite + self-restart
    // cycle. Writing them ourselves keeps first boot a single pass.
    it('includes `enabled: true` on every channel so the normalizer no-ops', () => {
        expect(output).toContain('"whatsapp"')
        // Count occurrences of "enabled": true — 5 channels + 2 plugin
        // entries (openrouter + browser) + browser block = 8 minimum.
        const enabledMatches = output.match(/"enabled":\s*true/g) || []
        expect(enabledMatches.length).toBeGreaterThanOrEqual(8)
    })

    it('includes a `plugins.entries` block for built-in plugins', () => {
        expect(output).toContain('"plugins"')
        expect(output).toContain('"openrouter"')
    })

    it('includes a pre-populated `meta` block matching the pinned openclaw version', () => {
        expect(output).toContain('"meta"')
        expect(output).toContain('"lastTouchedVersion": "2026.4.27"')
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
            expect(output).toContain('stage certbot')
        })

        it('firewall opens 22/80/443 before gateway + nginx start', () => {
            const fwIdx = output.indexOf('ufw allow 22/tcp')
            const gwIdx = output.indexOf('systemctl start openclaw-gateway')
            const nginxIdx = output.indexOf('systemctl reload nginx')
            expect(fwIdx).toBeGreaterThan(-1)
            expect(gwIdx).toBeGreaterThan(fwIdx)
            expect(nginxIdx).toBeGreaterThan(fwIdx)
        })

        it('gateway health poll is passive — no forced restart inside the loop', () => {
            // The old loop did `systemctl restart openclaw-gateway`
            // on every failed poll, which worked around a now-fixed
            // first-boot cycle but interfered with a healthy-but-slow
            // gateway startup. Ensure we don't reintroduce it.
            const pollSection = output.slice(
                output.indexOf('systemctl start openclaw-gateway'),
                output.indexOf('# nginx reverse proxy')
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
    })
})