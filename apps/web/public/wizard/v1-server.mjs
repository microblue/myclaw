// Claw setup wizard backend shim — v1
//
// Listens on 127.0.0.1:18790, fronted by Caddy at /myclaw/api/*.
// Runs as the openclaw user (same as the gateway), so it can directly
// invoke the openclaw CLI and write to its config. systemd restarts go
// through `sudo` (NOPASSWD via /etc/sudoers.d/openclaw seeded in
// cloud-init).

import http from 'node:http'
import { spawn } from 'node:child_process'

const PORT = 18790
const HOST = '127.0.0.1'
const OPENCLAW = '/opt/openclaw/bin/openclaw'
const ENV_DROPIN = '/etc/systemd/system/openclaw-gateway.service.d/wizard-env.conf'

const exec = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], ...opts })
    let stdout = '', stderr = ''
    p.stdout.on('data', d => { stdout += d.toString() })
    p.stderr.on('data', d => { stderr += d.toString() })
    p.on('error', reject)
    p.on('close', code => {
        if (code === 0) resolve(stdout)
        else reject(new Error(`${cmd} exited ${code}: ${stderr || stdout}`))
    })
    if (opts.input) { p.stdin.end(opts.input) }
})

const openclawCall = async (method) => {
    const out = await exec(OPENCLAW, ['gateway', 'call', method, '--json'])
    return JSON.parse(out)
}

const configPatch = async (patch) => {
    await exec(OPENCLAW, ['config', 'patch', '--stdin'], { input: JSON.stringify(patch) })
}

const configGet = async () => {
    const out = await exec(OPENCLAW, ['config', 'get', '--json'])
    const parsed = JSON.parse(out)
    return parsed.parsed || {}
}

const restartGateway = async () => {
    await exec('sudo', ['systemctl', 'daemon-reload'])
    await exec('sudo', ['systemctl', 'restart', 'openclaw-gateway'])
}

// Write OPENROUTER_API_KEY to a systemd drop-in. The original cloud-init
// bakes it into the unit file directly; this drop-in overrides it so we
// don't have to rewrite the unit. Drop-in dir is created in cloud-init.
const writeOpenrouterEnv = async (apiKey) => {
    const body = `[Service]\nEnvironment="OPENROUTER_API_KEY=${apiKey}"\n`
    await exec('sudo', ['tee', ENV_DROPIN], { input: body })
    await exec('sudo', ['chmod', '0644', ENV_DROPIN])
}

// ── Handlers ──────────────────────────────────────────

const handlers = {
    async 'GET /status'() {
        const cfg = await configGet()
        const liveStatus = await openclawCall('channels.status').catch(() => ({}))
        const channels = liveStatus.channels || {}
        const tg = cfg.channels?.telegram || {}
        const wxEntry = cfg.plugins?.entries?.['openclaw-weixin']
        return {
            model: {
                primary: cfg.agents?.defaults?.model?.primary || null,
                hasOpenRouterKey: Boolean(process.env.OPENROUTER_API_KEY) || (await dropinHasKey())
            },
            telegram: {
                configured: Boolean(tg.botToken),
                connected: Boolean(channels.telegram?.running),
                allowFrom: tg.allowFrom || []
            },
            wechat: {
                installed: Boolean(wxEntry),
                enabled: Boolean(wxEntry?.enabled),
                connected: Boolean(channels['openclaw-weixin']?.running || channels.weixin?.running)
            }
        }
    },

    async 'POST /model'({ body }) {
        const model = String(body?.model || '').trim()
        const apiKey = body?.apiKey ? String(body.apiKey).trim() : null
        if (!model) throw new Error('model is required')
        if (apiKey) await writeOpenrouterEnv(apiKey)
        await configPatch({
            agents: { defaults: { model: { primary: model } } }
        })
        await restartGateway()
        return { ok: true }
    },

    async 'POST /telegram'({ body }) {
        const token = String(body?.token || '').trim()
        const allowedUsers = Array.isArray(body?.allowedUsers) ? body.allowedUsers.map(String) : []
        if (!token) throw new Error('token is required')
        if (allowedUsers.length === 0) throw new Error('at least one allowed user id is required')
        await configPatch({
            channels: {
                telegram: {
                    enabled: true,
                    botToken: token,
                    allowFrom: allowedUsers,
                    dmPolicy: 'allowlist'
                }
            }
        })
        await restartGateway()
        return { ok: true }
    },

    async 'POST /wechat/install'() {
        await exec('npm', ['install', '-g', '--prefer-offline', '--no-audit', '--no-fund', '@tencent-weixin/openclaw-weixin'])
        await configPatch({
            plugins: { entries: { 'openclaw-weixin': { enabled: true } } }
        })
        await restartGateway()
        return { ok: true }
    },

    async 'POST /wechat/login'() {
        // QR scan flow lives in the full Control UI; the wizard just
        // hands the user off there once the plugin is installed.
        return { ok: true, redirectTo: '/' }
    }
}

const dropinHasKey = async () => {
    try {
        const out = await exec('cat', [ENV_DROPIN])
        return /OPENROUTER_API_KEY=\S+/.test(out)
    } catch { return false }
}

// ── HTTP plumbing ─────────────────────────────────────

const readBody = (req) => new Promise((resolve, reject) => {
    let data = ''
    req.on('data', c => { data += c.toString() })
    req.on('end', () => {
        if (!data) return resolve(null)
        try { resolve(JSON.parse(data)) } catch { reject(new Error('invalid JSON body')) }
    })
    req.on('error', reject)
})

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    const path = url.pathname.replace(/^\/myclaw\/api/, '').replace(/^\/api/, '') || '/'
    const key = `${req.method} ${path}`
    const handler = handlers[key]
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'no-store')
    if (!handler) {
        res.statusCode = 404
        res.end(JSON.stringify({ error: `no route for ${key}` }))
        return
    }
    try {
        const body = req.method === 'POST' || req.method === 'PUT' ? await readBody(req) : null
        const result = await handler({ body })
        res.statusCode = 200
        res.end(JSON.stringify(result))
    } catch (err) {
        res.statusCode = 500
        res.end(JSON.stringify({ error: err.message || String(err) }))
    }
})

server.listen(PORT, HOST, () => {
    console.log(`[wizard] listening on http://${HOST}:${PORT}`)
})