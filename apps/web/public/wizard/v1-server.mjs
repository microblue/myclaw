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
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises'
import path from 'node:path'

const PORT = 18790
const HOST = '127.0.0.1'
const OPENCLAW = '/opt/openclaw/bin/openclaw'
const GATEWAY_WS = 'ws://127.0.0.1:18789/'
const CONFIG_PATH = '/home/openclaw/.openclaw/openclaw.json'
const ENV_DROPIN = '/etc/systemd/system/openclaw-gateway.service.d/wizard-env.conf'
const WEIXIN_STATE_DIR = '/home/openclaw/.openclaw/state/openclaw-weixin/accounts'
const TENCENT_BASE = 'https://ilinkai.weixin.qq.com'
const TENCENT_BOT_TYPE = '3'

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
                        // operator.write needed for channels.start (used after WeChat
                        // login completes). operator.read covers channels.status + the
                        // rest. operator.admin may be needed for some methods we don't
                        // yet call — claim it too so future RPCs don't need a re-handshake.
                        scopes: ['operator.read', 'operator.write', 'operator.admin'],
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

// ── WeChat login session ─────────────────────────────
//
// We talk to Tencent's ilink endpoints directly — same protocol the
// openclaw-weixin plugin uses internally, just done from the shim
// without having to spawn `openclaw channels login`. Why bypass the
// CLI: cold-starting it costs ~5min (jiti TS JIT compile of 40+
// runtime deps) plus ~3min of one-time `npm install` for
// plugin-runtime-deps — and on every retry, killing the parent
// subprocess via `child.kill()` doesn't reach the grandchildren, so
// each click leaked a 414MB process tree.
//
// Endpoints (per openclaw-weixin/src/auth/login-qr.ts):
//   POST {base}/ilink/bot/get_bot_qrcode?bot_type=3
//        body: { local_token_list: [] }
//        → { qrcode, qrcode_img_content }   (qrcode is the session id;
//          qrcode_img_content is the displayable image URL)
//   GET  {base}/ilink/bot/get_qrcode_status?qrcode=<id>
//        long-poll up to ~30s
//        → { status: "wait" | "scaned" | "confirmed" | "expired" |
//                    "scaned_but_redirect" | "binded_redirect" |
//                    "need_verifycode" | "verify_code_blocked",
//            bot_token?, ilink_bot_id?, baseurl?, ilink_user_id?,
//            redirect_host? }
//
// On `confirmed` we save the account JSON in the same shape the
// plugin's saveWeixinAccount() writes, then call channels.start over
// the gateway WS so the running gateway picks it up — no restart.
const QR_TTL_MS = 5 * 60_000
const POLL_TIMEOUT_MS = 35_000
const wechat = {
    qrcode: null,
    qrcodeUrl: null,
    apiBaseUrl: TENCENT_BASE,
    startedAt: 0,
    status: 'idle',
    error: null
}
let activePollId = 0

const fetchTencentQr = async () => {
    const r = await fetch(`${TENCENT_BASE}/ilink/bot/get_bot_qrcode?bot_type=${TENCENT_BOT_TYPE}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ local_token_list: [] })
    })
    if (!r.ok) throw new Error(`Tencent QR fetch HTTP ${r.status}`)
    const data = await r.json()
    if (!data.qrcode || !data.qrcode_img_content) throw new Error('Tencent QR response missing qrcode/qrcode_img_content')
    return data
}

const pollTencentStatus = async (baseUrl, qrcode) => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), POLL_TIMEOUT_MS)
    try {
        const r = await fetch(`${baseUrl}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`, { signal: ctrl.signal })
        if (!r.ok) return { status: 'wait' }
        return await r.json()
    } catch {
        // Treat aborts (timeout) and network errors as 'wait' — let the loop retry.
        return { status: 'wait' }
    } finally {
        clearTimeout(timer)
    }
}

// Plugin's normalizeAccountId: strips characters that aren't safe in
// filesystem paths. ilink_bot_id looks like "<hex>@im.bot"; we want
// "<hex>-im-bot". Conservative: any non-alnum → dash, then collapse
// runs and trim.
const normalizeAccountId = (raw) => {
    return String(raw).replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

const saveWeixinAccount = async ({ ilinkBotId, botToken, baseUrl, userId }) => {
    const accountId = normalizeAccountId(ilinkBotId)
    if (!accountId) throw new Error('saveWeixinAccount: empty accountId after normalization')
    await mkdir(WEIXIN_STATE_DIR, { recursive: true })
    const data = {
        token: botToken,
        savedAt: new Date().toISOString(),
        ...(baseUrl ? { baseUrl } : {}),
        ...(userId ? { userId } : {})
    }
    const filePath = path.join(WEIXIN_STATE_DIR, `${accountId}.json`)
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
    try { await chmod(filePath, 0o600) } catch { /* best-effort */ }
    return accountId
}

const setWechatStatus = (status, error = null) => {
    wechat.status = status
    wechat.error = error
}

const pollLoop = async (myPollId) => {
    while (myPollId === activePollId && wechat.qrcode && Date.now() - wechat.startedAt < QR_TTL_MS) {
        const res = await pollTencentStatus(wechat.apiBaseUrl, wechat.qrcode)
        if (myPollId !== activePollId) return
        switch (res.status) {
            case 'confirmed': {
                if (!res.ilink_bot_id || !res.bot_token) {
                    setWechatStatus('error', 'Tencent confirmed login but did not return bot token')
                    wechat.qrcode = null
                    return
                }
                try {
                    const accountId = await saveWeixinAccount({
                        ilinkBotId: res.ilink_bot_id,
                        botToken: res.bot_token,
                        baseUrl: res.baseurl || TENCENT_BASE,
                        userId: res.ilink_user_id
                    })
                    // Tell the running gateway to start the channel for this
                    // account. If the channel was already running for another
                    // account, this adds the new one. Soft-fail: the plugin
                    // also reloads on file-watch, so the worst case is a few
                    // seconds delay before /status reports connected.
                    await gatewayWsCall('channels.start', { channel: 'openclaw-weixin', accountId }).catch(() => {})
                    setWechatStatus('confirmed')
                } catch (err) {
                    setWechatStatus('error', err.message || String(err))
                }
                wechat.qrcode = null
                return
            }
            case 'scaned_but_redirect': {
                if (res.redirect_host) wechat.apiBaseUrl = `https://${res.redirect_host}`
                setWechatStatus('scaned')
                break
            }
            case 'scaned': {
                setWechatStatus('scaned')
                break
            }
            case 'expired': {
                setWechatStatus('expired', 'QR expired — click Show QR again')
                wechat.qrcode = null
                return
            }
            case 'binded_redirect': {
                setWechatStatus('error', '该 OpenClaw 已经连接过此微信账号，无需重复连接')
                wechat.qrcode = null
                return
            }
            case 'need_verifycode':
            case 'verify_code_blocked': {
                setWechatStatus('error', '需要在终端输入验证码 — 暂不支持 Web 流程，请 SSH 登录后运行 `openclaw channels login --channel openclaw-weixin`')
                wechat.qrcode = null
                return
            }
            default: { /* 'wait' or unknown — keep polling */ }
        }
        // Brief gap so we don't hammer Tencent if the long-poll returned fast.
        await new Promise(r => setTimeout(r, 1000))
    }
    if (myPollId === activePollId) {
        wechat.qrcode = null
        if (wechat.status !== 'confirmed') setWechatStatus('expired', 'QR expired — click Show QR again')
    }
}

const startWechatLogin = async () => {
    // Reuse a fresh QR if one is still warm (avoids spamming Tencent).
    if (wechat.qrcode && wechat.qrcodeUrl && Date.now() - wechat.startedAt < QR_TTL_MS - 30_000) {
        return { qr: wechat.qrcodeUrl, resumed: true }
    }
    activePollId++ // invalidate any prior loop
    const myPollId = activePollId
    wechat.qrcode = null
    wechat.qrcodeUrl = null
    wechat.apiBaseUrl = TENCENT_BASE
    wechat.startedAt = Date.now()
    setWechatStatus('fetching')

    const data = await fetchTencentQr()
    wechat.qrcode = data.qrcode
    wechat.qrcodeUrl = data.qrcode_img_content
    setWechatStatus('waiting')
    pollLoop(myPollId).catch(err => {
        if (myPollId === activePollId) setWechatStatus('error', err.message || String(err))
    })
    return { qr: data.qrcode_img_content, resumed: false }
}

// ── Handlers ──────────────────────────────────────────

const handlers = {
    async 'GET /status'() {
        const cfg = await configGet()
        const liveStatus = await gatewayWsCall('channels.status', {}).catch(() => ({}))
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
                connected: Boolean(channels['openclaw-weixin']?.configured || channels['openclaw-weixin']?.running),
                qrSession: wechat.qrcode || wechat.status === 'confirmed' || wechat.status === 'expired' || wechat.status === 'error'
                    ? { status: wechat.status, error: wechat.error }
                    : null
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