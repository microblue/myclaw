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
        expect(output).toContain('"lastTouchedVersion": "2026.4.19-beta.2"')
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
})