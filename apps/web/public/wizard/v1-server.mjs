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
const GATEWAY_WS = 'ws://127.0.0.1:18789/'
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

// Talk to the gateway directly over WebSocket instead of `openclaw gateway
// call`. The CLI spends ~12s on every invocation re-loading 40+ plugins via
// jiti TS JIT — fatal for `/status` interactivity. A direct WS round-trip
// (handshake + hello-ok + method) settles in ~600ms on loopback. We declare
// `client.id: gateway-client`, `mode: backend` which lets the gateway skip
// device pairing for trusted same-process loopback calls (see
// docs/gateway/protocol.md).
const gatewayWsCall = async (method, params = {}) => {
    const token = await expectedToken()
    if (!token) throw new Error('gateway token unavailable')
    return await new Promise((resolve, reject) => {
        const ws = new WebSocket(GATEWAY_WS)
        let helloRcv = false
        let id = 0
        const next = () => 'r' + (++id)
        const timer = setTimeout(() => {
            try { ws.close() } catch { /* noop */ }
            reject(new Error(`gateway ${method} timed out after 5s`))
        }, 5000)
        const finish = (err, val) => {
            clearTimeout(timer)
            try { ws.close() } catch { /* noop */ }
            if (err) reject(err)
            else resolve(val)
        }
        ws.onerror = () => finish(new Error('gateway WS connection failed'))
        ws.onmessage = (ev) => {
            let msg
            try { msg = JSON.parse(ev.data) } catch { return }
            if (msg.type === 'event' && msg.event === 'connect.challenge') {
                ws.send(JSON.stringify({
                    type: 'req',
                    id: next(),
                    method: 'connect',
                    params: {
                        minProtocol: 3,
                        maxProtocol: 3,
                        client: { id: 'gateway-client', version: 'wizard', platform: 'linux', mode: 'backend' },
                        role: 'operator',
                        scopes: ['operator.read'],
                        caps: [],
                        commands: [],
                        permissions: {},
                        auth: { token }
                    }
                }))
                return
            }
            if (msg.type !== 'res') return
            if (!helloRcv) {
                helloRcv = true
                if (!msg.ok) return finish(new Error(`gateway connect failed: ${JSON.stringify(msg.payload).slice(0, 200)}`))
                ws.send(JSON.stringify({ type: 'req', id: next(), method, params }))
                return
            }
            if (!msg.ok) return finish(new Error(`gateway ${method} failed: ${JSON.stringify(msg.payload).slice(0, 200)}`))
            finish(null, msg.payload)
        }
    })
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

// ── Handlers ──────────────────────────────────────────

const handlers = {
    async 'GET /status'() {
        const cfg = await configGet()
        const liveStatus = await gatewayWsCall('channels.status', {}).catch(() => ({}))
        const channels = liveStatus.channels || {}
        const tg = cfg.channels?.telegram || {}
        return {
            model: {
                primary: cfg.agents?.defaults?.model?.primary || null,
                hasOpenRouterKey: await gatewayHasOpenrouterKey()
            },
            telegram: {
                configured: Boolean(tg.botToken),
                connected: Boolean(channels.telegram?.running),
                allowFrom: tg.allowFrom || []
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