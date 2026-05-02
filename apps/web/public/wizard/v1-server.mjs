// Claw setup wizard backend shim — v1
//
// Listens on 127.0.0.1:18790, fronted by Caddy at /myclaw/api/*.
// Runs as the openclaw user (same as the gateway), so it can directly
// invoke the openclaw CLI and write to its config. systemd restarts go
// through `sudo` (NOPASSWD via /etc/sudoers.d/openclaw seeded in
// cloud-init).
//
// Auth: every request must carry `Authorization: Bearer <gateway_token>`.
// The token is the same value the user sees as gateway.auth.token in
// openclaw.json — the platform's claw detail page hands the wizard URL
// over already-tokenized as `/myclaw/#t=<token>`.

import http from 'node:http'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const PORT = 18790
const HOST = '127.0.0.1'
const OPENCLAW = '/opt/openclaw/bin/openclaw'
const CONFIG_PATH = '/home/openclaw/.openclaw/openclaw.json'
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
    const raw = await readFile(CONFIG_PATH, 'utf8')
    return JSON.parse(raw)
}

const restartGateway = async () => {
    await exec('sudo', ['systemctl', 'daemon-reload'])
    await exec('sudo', ['systemctl', 'restart', 'openclaw-gateway'])
}

const writeOpenrouterEnv = async (apiKey) => {
    const body = `[Service]\nEnvironment="OPENROUTER_API_KEY=${apiKey}"\n`
    await exec('sudo', ['tee', ENV_DROPIN], { input: body })
    await exec('sudo', ['chmod', '0644', ENV_DROPIN])
}

// systemctl show is read-only and merges values from the main unit and
// every drop-in, so it's the one source of truth for "does the gateway
// see an OPENROUTER_API_KEY at boot?".
const gatewayHasOpenrouterKey = async () => {
    try {
        const out = await exec('systemctl', ['show', 'openclaw-gateway', '--property=Environment', '--value'])
        return /OPENROUTER_API_KEY=\S+/.test(out)
    } catch { return false }
}

// ── WeChat login session ─────────────────────────────
//
// `openclaw channels login --channel openclaw-weixin` is interactive — it
// prints a base64 QR data URL to stdout, then long-polls Tencent's API
// until the user scans + confirms, at which point it auto-saves the
// account and exits. We spawn it as a long-lived child, scrape the QR
// from stdout to forward to the wizard SPA, and let it run to
// completion in the background.
const wechat = {
    child: null,
    qr: null,
    startedAt: 0,
    expired: false
}

const QR_PATTERN = /data:image\/png;base64,[A-Za-z0-9+/=]+/

const startWechatLogin = async () => {
    if (wechat.child && !wechat.expired && wechat.qr && Date.now() - wechat.startedAt < 240_000) {
        return { qr: wechat.qr, resumed: true }
    }
    if (wechat.child) {
        try { wechat.child.kill() } catch { /* already gone */ }
    }
    wechat.child = null
    wechat.qr = null
    wechat.expired = false
    wechat.startedAt = Date.now()

    const child = spawn(OPENCLAW, ['channels', 'login', '--channel', 'openclaw-weixin'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
    })
    wechat.child = child

    return new Promise((resolve, reject) => {
        let resolved = false
        const finish = (err, val) => {
            if (resolved) return
            resolved = true
            clearTimeout(timer)
            if (err) reject(err)
            else resolve(val)
        }
        const timer = setTimeout(() => {
            try { child.kill() } catch { /* noop */ }
            finish(new Error('QR fetch timed out after 30s'))
        }, 30_000)
        const onData = (buf) => {
            // QR data-URL chars (base64) never overlap ANSI color codes,
            // so matching against the raw stream works without stripping.
            const m = buf.toString().match(QR_PATTERN)
            if (m) {
                wechat.qr = m[0]
                finish(null, { qr: m[0], resumed: false })
            }
        }
        child.stdout.on('data', onData)
        child.stderr.on('data', onData)
        child.on('exit', () => {
            wechat.expired = true
            finish(new Error('channels login exited before QR appeared'))
        })
        child.on('error', (err) => finish(err))
    })
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
                hasOpenRouterKey: await gatewayHasOpenrouterKey()
            },
            telegram: {
                configured: Boolean(tg.botToken),
                connected: Boolean(channels.telegram?.running),
                allowFrom: tg.allowFrom || []
            },
            wechat: {
                installed: Boolean(wxEntry),
                enabled: Boolean(wxEntry?.enabled),
                connected: Boolean(channels['openclaw-weixin']?.configured || channels['openclaw-weixin']?.running)
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

    async 'POST /wechat/start'() {
        return await startWechatLogin()
    }
}

// ── Auth ──────────────────────────────────────────────

let cachedToken = null
const expectedToken = async () => {
    if (cachedToken) return cachedToken
    const cfg = await configGet()
    cachedToken = cfg.gateway?.auth?.token || ''
    return cachedToken
}

const checkAuth = async (req) => {
    const header = req.headers.authorization || ''
    const m = header.match(/^Bearer\s+(.+)$/i)
    if (!m) return false
    const expected = await expectedToken()
    if (!expected) return false
    return m[1].trim() === expected
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
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'no-store')
    if (!(await checkAuth(req))) {
        res.statusCode = 401
        res.end(JSON.stringify({ error: 'unauthorized — open the wizard via the link from your dashboard' }))
        return
    }
    const handler = handlers[key]
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