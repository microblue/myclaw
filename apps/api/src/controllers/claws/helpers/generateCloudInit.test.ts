import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import generateCloudInit from './generateCloudInit'

// install-claw.sh is the bulk of the install flow; cloud-init's
// userData is now a tiny wrapper that exports per-claw env vars and
// curl|bash's the installer. These tests cover both halves: the
// rendered wrapper's contract, and the on-disk installer's content.
const INSTALLER_PATH = resolve(
    import.meta.dirname,
    '../../../../cloud-scripts/install-claw.sh'
)
const installer = readFileSync(INSTALLER_PATH, 'utf-8')

describe('generateCloudInit (wrapper)', () => {
    const output = generateCloudInit(
        "myP@ss'123",
        'sample-test',
        'myclaw.one',
        'tok-abc',
        { openrouterApiKey: 'sk-or-v1-xyz', defaultModel: 'auto' },
        {
            clawId: 'claw-1',
            installRunId: 'run-1',
            centralToken: 'central-tok'
        }
    )

    it('starts with a bash shebang', () => {
        expect(output.startsWith('#!/bin/bash')).toBe(true)
    })

    it('curl|bashes the centralized installer', () => {
        expect(output).toContain(
            'curl -fsSL "https://myclaw.one/api/cloud-scripts/install-claw" | bash'
        )
    })

    it('exports the required per-claw env vars', () => {
        expect(output).toContain('export ROOT_PASSWORD=')
        expect(output).toContain("export SUBDOMAIN='sample-test'")
        expect(output).toContain("export DOMAIN='myclaw.one'")
        expect(output).toContain("export GATEWAY_TOKEN='tok-abc'")
        expect(output).toMatch(/export CONFIG_JSON_B64='[A-Za-z0-9+/=]+'/)
    })

    it('escapes single quotes in the root password', () => {
        // Single-quote is the only metacharacter we have to handle; the
        // wrapper writes ROOT_PASSWORD inside single quotes, so an
        // embedded `'` becomes the standard `'\\''` quoting dance.
        expect(output).toContain("'myP@ss'\\''123'")
    })

    it('exports OPENROUTER_API_KEY when llm config provided', () => {
        expect(output).toContain("export OPENROUTER_API_KEY='sk-or-v1-xyz'")
    })

    it('exports install-progress reporter env vars when install context provided', () => {
        expect(output).toContain(
            "export IE='https://myclaw.one/install/claw-1/phase'"
        )
        expect(output).toContain("export IT='central-tok'")
        expect(output).toContain("export IR='run-1'")
    })

    it('omits install-progress env vars when install context is undefined', () => {
        const noInstall = generateCloudInit(
            'pw',
            'sub',
            'myclaw.one',
            'tok',
            { openrouterApiKey: null }
        )
        expect(noInstall).not.toContain('export IE=')
        expect(noInstall).not.toContain('export IT=')
        expect(noInstall).not.toContain('export IR=')
    })

    it('omits OPENROUTER_API_KEY when no llm config is provided', () => {
        const noLlm = generateCloudInit('pw', 'sub', 'myclaw.one', 'tok')
        expect(noLlm).not.toContain('OPENROUTER_API_KEY')
    })

    it('encodes the openclaw config as base64 (no shell escaping needed)', () => {
        const match = output.match(/CONFIG_JSON_B64='([A-Za-z0-9+/=]+)'/)
        expect(match).not.toBeNull()
        const decoded = Buffer.from(match![1], 'base64').toString('utf-8')
        const parsed = JSON.parse(decoded)
        // Spot-check the config fields we care most about being preserved
        expect(parsed.gateway?.auth?.token).toBe('tok-abc')
        expect(parsed.gateway?.reload?.mode).toBe('off')
        expect(parsed.channels?.whatsapp?.enabled).toBe(true)
        expect(parsed.plugins?.entries?.openrouter?.enabled).toBe(true)
    })

    it('declares a default `main` agent so the studio chat is usable on first load', () => {
        // Without this, `agents.list` is empty and studio renders
        // "No agents available. Use New Agent to add your first
        // agent." — the user has to click around before they can
        // chat. Pre-declaring `main` + seeding its personality on
        // disk gives the user a working chat the moment the page
        // loads.
        const match = output.match(/CONFIG_JSON_B64='([A-Za-z0-9+/=]+)'/)
        const decoded = Buffer.from(match![1], 'base64').toString('utf-8')
        const parsed = JSON.parse(decoded)
        expect(Array.isArray(parsed.agents?.list)).toBe(true)
        expect(parsed.agents.list.length).toBeGreaterThanOrEqual(1)
        const main = parsed.agents.list.find(
            (a: { id?: string }) => a.id === 'main'
        )
        expect(main).toBeTruthy()
        expect(main.default).toBe(true)
    })

    it('rendered wrapper stays well under the AWS Lightsail userData cap', () => {
        const realToken = 'a'.repeat(64)
        const realOrKey = 'sk-or-v1-' + 'x'.repeat(64)
        const realistic = generateCloudInit(
            'PlaceholderRoot123!@#',
            'sample-test',
            'myclaw.one',
            realToken,
            {
                openrouterApiKey: realOrKey,
                defaultModel: 'openrouter/anthropic/claude-sonnet-4.6'
            },
            {
                clawId: 'a'.repeat(36),
                installRunId: 'b'.repeat(36),
                centralToken: 'c'.repeat(64)
            }
        )
        const b64Bytes = Buffer.from(realistic, 'utf8').toString('base64').length
        // Lightsail's hard cap is 16 KB after base64. Pre-extraction
        // we were over by ~270 bytes; post-extraction the rendered
        // wrapper + base64'd config should fit with kilobytes to spare.
        expect(b64Bytes).toBeLessThan(8 * 1024)
    })
})

describe('install-claw.sh', () => {
    it('is a bash script', () => {
        expect(installer.startsWith('#!/bin/bash')).toBe(true)
    })

    it('asserts every required env var is set so a misconfigured wrapper fails loudly', () => {
        for (const v of [
            'ROOT_PASSWORD',
            'SUBDOMAIN',
            'DOMAIN',
            'GATEWAY_TOKEN',
            'CONFIG_JSON_B64'
        ]) {
            expect(installer).toContain(`: "\${${v}:?`)
        }
    })

    it('decodes CONFIG_JSON_B64 into the openclaw config file', () => {
        expect(installer).toContain(
            'echo "$CONFIG_JSON_B64" | base64 -d > /home/openclaw/.openclaw/openclaw.json'
        )
    })

    it('installs the pinned openclaw version under /opt/openclaw owned by openclaw user', () => {
        expect(installer).toContain('useradd -r -m -d /home/openclaw -s /bin/bash openclaw')
        expect(installer).toContain('chown -R openclaw:openclaw /opt/openclaw')
        expect(installer).toContain('npm install -g')
        expect(installer).toContain('openclaw@2026.4.11')
    })

    it('configures caddy reverse proxy to the gateway and 80/443 firewall', () => {
        expect(installer).toContain('reverse_proxy 127.0.0.1:3000')
        expect(installer).toContain('ufw allow 80/tcp')
        expect(installer).toContain('ufw allow 443/tcp')
    })

    it('ships node_exporter behind the gateway-token-gated /metrics endpoint', () => {
        expect(installer).toContain('node_exporter')
        expect(installer).toContain('/metrics')
        expect(installer).toContain('Bearer ${GATEWAY_TOKEN}')
    })

    it('node-exporter stage is non-fatal so a download / start failure does not abort bootstrap', () => {
        // The stage runs in a subshell wrapped with `|| echo` so an
        // unprebuilt arch / network glitch warns instead of failing
        // the whole install.
        expect(installer).toMatch(
            /\) \|\| echo "\[oc\] node_exporter setup failed/
        )
    })

    it('escapes the literal $ in the node_exporter systemd ExecStart', () => {
        // systemd would otherwise try to expand $$|/) at unit-load
        // time. Doubling the dollar tells systemd to leave it alone.
        expect(installer).toContain('($$|/)')
    })

    it('starts with a sshd-config + swap setup before apt to keep the VM reachable on first boot', () => {
        const sshdAt = installer.indexOf('stage sshd-config')
        const swapAt = installer.indexOf('stage swap')
        const aptAt = installer.indexOf('stage apt-base')
        expect(sshdAt).toBeGreaterThan(0)
        expect(swapAt).toBeGreaterThan(sshdAt)
        expect(aptAt).toBeGreaterThan(swapAt)
    })

    it('phases up to the canonical AI-OS install-progress markers', () => {
        // These keys must match
        // apps/api/src/controllers/install/postInstallPhase.ts
        // ALLOWED_PHASES — the page UI's checklist hangs off these.
        for (const p of [
            'mounting_storage',
            'installing_kernel',
            'loading_skills',
            'calibrating_agents',
            'wiring_network',
            'issuing_certificate',
            'ready'
        ]) {
            expect(installer).toContain(`phase ${p}`)
        }
    })

    it('wires phase failed via the EXIT trap so a crashed install reports its terminal state', () => {
        expect(installer).toMatch(/trap '.*phase failed.*' EXIT/)
    })

    it('phase POSTs are best-effort — a 5xx must not abort the install', () => {
        expect(installer).toMatch(
            /curl -fsS .*"\$IE".*-H "Authorization: Bearer \$IT".*\|\| true/
        )
    })

    it('phase reporter is a no-op when IE is unset (legacy callers / tests)', () => {
        expect(installer).toContain('[ -z "${IE:-}" ] && return 0')
    })

    it('schedules openclaw-studio install via systemd oneshot', () => {
        expect(installer).toContain('oc-stu-i.service')
        expect(installer).toContain('install-studio')
    })

    it('seeds the main agent personality on disk so studio renders content on first load', () => {
        // Per the user's "open and use" requirement, the studio must
        // load with a working agent already present. We verify the
        // installer writes IDENTITY/AGENTS/SOUL/HEARTBEAT/MEMORY
        // under both agents/main/agent (where studio reads via
        // agents.files.get) and workspace (legacy callers).
        expect(installer).toContain('write_agent_files()')
        expect(installer).toContain(
            'write_agent_files /home/openclaw/.openclaw/agents/main/agent'
        )
        expect(installer).toContain(
            'write_agent_files /home/openclaw/.openclaw/workspace'
        )
        // Spot-check the personality content is present in the
        // installer's heredoc — at least IDENTITY + AGENTS so the
        // "main" agent has both the system prompt and the
        // orchestrator role description on first chat.
        expect(installer).toMatch(/IDENTITY\.md.*<<\s*'IDEOF'/s)
        expect(installer).toMatch(/AGENTS\.md.*<<\s*'AGEOF'/s)
        expect(installer).toMatch(/SOUL\.md.*<<\s*'SOULEOF'/s)
    })
})