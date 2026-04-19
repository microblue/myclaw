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