// CORS helper for the SPA-facing /api/myclaw/** routes.
//
// The myclaw central SPA at https://myclaw.one calls this claw's
// public hostname to fetch Intent messages and outline. Browsers
// require a matching origin in Access-Control-Allow-Origin headers
// and a successful preflight (OPTIONS).
//
// We intentionally don't allow `*` — credentials are required (the
// Supabase JWT lives in the SPA's localStorage, attached as Bearer)
// and `*` is invalid with `credentials: include` semantics. A fixed
// allowlist is also a defense-in-depth check: a different origin
// can't trigger a cross-origin GET against this claw even if a leaked
// JWT lands there.

const ALLOWED_ORIGINS = new Set([
    'https://myclaw.one',
    'https://www.myclaw.one',
    // Local dev for SPA work against a remote claw — opt-in via env.
    ...(process.env.MYCLAW_DEV === '1' ? ['http://localhost:1111'] : [])
])

export const corsHeaders = (origin: string | null): Record<string, string> => {
    const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : ''
    if (!allowed) return {}
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin'
    }
}

export const respondWithCors = (
    request: Request,
    body: BodyInit | null,
    init: ResponseInit = {}
): Response => {
    const origin = request.headers.get('origin')
    return new Response(body, {
        ...init,
        headers: { ...(init.headers as Record<string, string> | undefined), ...corsHeaders(origin) }
    })
}

// OPTIONS preflight short-circuit. Returns 204 with the CORS headers
// when origin is allowed, 403 otherwise.
export const handlePreflight = (request: Request): Response => {
    const origin = request.headers.get('origin')
    const headers = corsHeaders(origin)
    if (Object.keys(headers).length === 0) {
        return new Response(null, { status: 403 })
    }
    return new Response(null, { status: 204, headers })
}
