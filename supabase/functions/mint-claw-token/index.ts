// mint-claw-token — Phase 6 v1
//
// myclaw-aios (SPA, anon key only) calls this Edge Function to obtain a
// short-lived token + URL for opening a WebSocket to a per-user claw
// gateway. The browser must never see the long-lived claws.gateway_token
// directly; later phases will mint a signed, time-limited derivative.
// v1 returns the existing gateway_token verbatim behind RLS-equivalent
// authorization. The contract is the boundary aios pins to — body and
// response shape stay stable while the minting policy hardens.
//
// Contract:
//   POST /functions/v1/mint-claw-token
//   Authorization: Bearer <user JWT>
//   Body: { "claw_id": "<text id>" }
//
//   200 -> { url, token, expires_at, claw_id }
//   400 -> { error, code: 'invalid_body' }
//   401 -> { error, code: 'missing_auth' | 'invalid_jwt' }
//   403 -> { error, code: 'forbidden' }
//   404 -> { error, code: 'not_found' }
//   409 -> { error, code: 'claw_not_ready' }   sentinel / pending / etc.
//   500 -> { error, code: 'db_error' | 'internal' }

import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

type Json = Record<string, unknown>

// aios calls this Edge Function from the browser (app.myclaw.one,
// preview deploys, Tauri webview), so CORS preflights must succeed.
// We allow any origin and the explicit headers our fetch in
// src/gateway/mint.ts sends. `Vary: Origin` keeps caches honest.
const CORS_HEADERS: HeadersInit = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
    'access-control-max-age': '3600',
    vary: 'Origin'
}

const json = (body: Json, status: number) =>
    new Response(JSON.stringify(body), {
        status,
        headers: {
            'content-type': 'application/json; charset=utf-8',
            ...CORS_HEADERS
        }
    })

const fail = (status: number, code: string, error?: string) =>
    json({ error: error ?? code, code }, status)

// Real ready claws on prod have status='running' + subdomain set.
// Sentinel claws (from handle_new_auth_user trigger, plan_id='aios-prototype')
// have status='active' but NULL subdomain — those are the rows we reject
// with claw_not_ready so the SPA can show the "go install a real claw"
// banner. Deviates from the spec which wrote `status != 'active'`; that
// predicate would have rejected real running claws by accident.
const isClawReady = (claw: { status: string | null; subdomain: string | null }) =>
    claw.subdomain != null &&
    (claw.status === 'running' || claw.status === 'active')

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        // Browser preflight — answer with the same CORS headers,
        // empty body. No auth check here; the actual POST is guarded.
        return new Response(null, { status: 204, headers: CORS_HEADERS })
    }
    if (req.method !== 'POST') {
        return fail(405, 'method_not_allowed')
    }

    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
        return fail(401, 'missing_auth')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !anonKey || !serviceKey) {
        return fail(500, 'internal', 'missing env vars on the function')
    }

    // User-context client — propagates the caller JWT so auth.getUser()
    // hits Supabase auth as the real user.
    const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false }
    })

    const {
        data: { user },
        error: userErr
    } = await userClient.auth.getUser()
    if (userErr || !user) {
        return fail(401, 'invalid_jwt')
    }

    const body = (await req.json().catch(() => null)) as { claw_id?: unknown } | null
    if (!body || typeof body.claw_id !== 'string' || !body.claw_id) {
        return fail(400, 'invalid_body', 'claw_id (string) is required')
    }
    const clawId = body.claw_id

    // Service-role client — bypasses RLS so we can read gateway_token
    // (which the user MUST NOT see via PostgREST). Authorization is
    // enforced explicitly below.
    const admin = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    })

    const { data: claw, error: clawErr } = await admin
        .from('claws')
        .select('id, user_id, subdomain, status, plan_id')
        .eq('id', clawId)
        .maybeSingle()

    if (clawErr) {
        console.error('claws lookup failed', clawErr)
        return fail(500, 'db_error')
    }
    if (!claw) {
        return fail(404, 'not_found')
    }

    // Phase 6 v1: owner-only authz. claw_grants table for shared access
    // is Phase 7+; add the EXISTS-join here when it lands.
    // TODO(phase-7): also accept callers with an active row in claw_grants
    // for this claw_id.
    if (claw.user_id !== user.id) {
        return fail(403, 'forbidden')
    }

    if (!isClawReady(claw)) {
        return fail(409, 'claw_not_ready')
    }

    // Fetch the gateway token via the decrypt_gateway_token RPC.
    // The RPC handles both pre-encryption (legacy plaintext) and post-
    // encryption (Vault key) rows transparently.
    const { data: tokenData, error: tokenErr } = await admin.rpc(
        'decrypt_gateway_token',
        { claw_id: claw.id }
    )
    if (tokenErr) {
        console.error('decrypt_gateway_token failed', tokenErr)
        return fail(500, 'db_error')
    }
    const gatewayToken = tokenData as string | null
    if (!gatewayToken) {
        // Real running claw with no token in DB — shouldn't happen, but
        // surface as not_ready rather than leaking nullness as 500.
        return fail(409, 'claw_not_ready')
    }

    // TODO(phase-7): swap to a signed JWT derived from gateway_token
    // (HS256 with a per-claw signing key, short exp). The contract
    // (url + token + expires_at) doesn't change so the SPA upgrade is
    // server-only. Also: encrypt claws.gateway_token at rest — today
    // it's stored as plain text in the column (see schema
    // 20260504000001_initial_schema.sql).
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    return json(
        {
            url: `wss://${claw.subdomain}.myclaw.one/ws`,
            token: gatewayToken,
            expires_at: expiresAt,
            claw_id: claw.id
        },
        200
    )
})
