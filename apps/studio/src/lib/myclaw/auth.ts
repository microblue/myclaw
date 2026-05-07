// Supabase JWT validation for SPA-originated calls.
//
// This file is fork-specific (added by the myclaw vendor — see
// ../../FORK.md). It validates the bearer token attached to requests
// from https://myclaw.one against the cached Supabase JWKS for the
// project this claw is bound to. Per docs/aios-design.md §4.4, the
// auth bridge gives the SPA cross-origin read access to per-claw
// data without us baking a long-lived service token onto every
// browser.
//
// The token is a Supabase access JWT (RS256). We compare `sub`
// (the Supabase user id) against the OWNER_USER_ID env var that
// install-claw.sh writes onto the VM at provision time. JWKS is
// cached for 1 hour with stale-while-revalidate semantics: a
// validation failure with a >5min-old cache triggers a single
// re-fetch before the 401 fires, so a Supabase rotation has near-
// zero impact on a live claw.
//
// Other studio routes use cookie auth keyed off the local gateway
// token; THIS path is mounted only on `/api/myclaw/**` so the
// existing routes are unaffected.

import { createPublicKey, createVerify } from 'node:crypto'

const SUPABASE_JWKS_URL = process.env.MYCLAW_JWKS_URL || ''
const OWNER_USER_ID = process.env.MYCLAW_OWNER_USER_ID || ''
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000
const JWKS_REFRESH_AFTER_MS = 5 * 60 * 1000

interface Jwk {
    kid: string
    kty: string
    n: string
    e: string
    alg?: string
}

interface JwksCache {
    keys: Jwk[]
    fetchedAt: number
}

let jwksCache: JwksCache | null = null

const fetchJwks = async (): Promise<Jwk[]> => {
    if (!SUPABASE_JWKS_URL) {
        throw new Error('MYCLAW_JWKS_URL not configured')
    }
    const res = await fetch(SUPABASE_JWKS_URL, {
        signal: AbortSignal.timeout(5_000)
    })
    if (!res.ok) {
        throw new Error(`JWKS fetch failed: ${res.status}`)
    }
    const body = (await res.json()) as { keys?: Jwk[] }
    if (!Array.isArray(body.keys)) {
        throw new Error('JWKS response missing `keys`')
    }
    return body.keys
}

const getJwks = async (forceRefresh = false): Promise<Jwk[]> => {
    const now = Date.now()
    if (
        !forceRefresh &&
        jwksCache &&
        now - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS
    ) {
        return jwksCache.keys
    }
    const keys = await fetchJwks()
    jwksCache = { keys, fetchedAt: now }
    return keys
}

const decodeJwtSegments = (token: string) => {
    const parts = token.split('.')
    if (parts.length !== 3) throw new Error('Malformed JWT')
    const [headerB64, payloadB64, signatureB64] = parts
    const header = JSON.parse(
        Buffer.from(headerB64, 'base64url').toString('utf-8')
    )
    const payload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf-8')
    )
    const signature = Buffer.from(signatureB64, 'base64url')
    const signed = `${headerB64}.${payloadB64}`
    return { header, payload, signature, signed }
}

const verifySignature = (
    signed: string,
    signature: Buffer,
    jwk: Jwk
): boolean => {
    const key = createPublicKey({ key: jwk, format: 'jwk' })
    const verify = createVerify('RSA-SHA256')
    verify.update(signed)
    verify.end()
    return verify.verify(key, signature)
}

export interface VerifiedToken {
    sub: string
    exp: number
    email?: string
}

export interface VerifyResult {
    ok: boolean
    token?: VerifiedToken
    reason?: 'no_token' | 'malformed' | 'unknown_kid' | 'bad_signature' | 'expired' | 'wrong_subject' | 'jwks_unavailable'
}

// Validates a Supabase JWT and confirms the `sub` claim matches the
// owner of this claw. Returns a structured result rather than
// throwing so the caller can pick the right HTTP status.
export const verifyMyclawToken = async (
    token: string
): Promise<VerifyResult> => {
    if (!token) return { ok: false, reason: 'no_token' }

    let decoded
    try {
        decoded = decodeJwtSegments(token)
    } catch {
        return { ok: false, reason: 'malformed' }
    }
    const { header, payload, signature, signed } = decoded

    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) {
        return { ok: false, reason: 'expired' }
    }
    if (
        OWNER_USER_ID &&
        typeof payload.sub === 'string' &&
        payload.sub !== OWNER_USER_ID
    ) {
        return { ok: false, reason: 'wrong_subject' }
    }

    let keys: Jwk[]
    try {
        keys = await getJwks(false)
    } catch {
        return { ok: false, reason: 'jwks_unavailable' }
    }

    let jwk = keys.find((k) => k.kid === header.kid)

    // Stale-while-revalidate: cache miss + age exceeds the refresh
    // floor → refetch once before giving up. This is the path that
    // makes Supabase JWKS rotation invisible to live claws.
    if (
        !jwk &&
        jwksCache &&
        Date.now() - jwksCache.fetchedAt > JWKS_REFRESH_AFTER_MS
    ) {
        try {
            keys = await getJwks(true)
            jwk = keys.find((k) => k.kid === header.kid)
        } catch {
            return { ok: false, reason: 'jwks_unavailable' }
        }
    }

    if (!jwk) return { ok: false, reason: 'unknown_kid' }

    if (!verifySignature(signed, signature, jwk)) {
        return { ok: false, reason: 'bad_signature' }
    }

    return {
        ok: true,
        token: {
            sub: String(payload.sub ?? ''),
            exp: payload.exp,
            email:
                typeof payload.email === 'string' ? payload.email : undefined
        }
    }
}

// Pulls Bearer token out of Authorization header. Returns '' if
// absent or malformed. Calls .toLowerCase() on the scheme so an
// odd-cased "BEARER" still works.
export const extractBearer = (request: Request): string => {
    const header = request.headers.get('authorization') || ''
    const trimmed = header.trim()
    if (!trimmed) return ''
    const [scheme, ...rest] = trimmed.split(/\s+/)
    if (scheme.toLowerCase() !== 'bearer' || rest.length === 0) return ''
    return rest.join(' ').trim()
}
