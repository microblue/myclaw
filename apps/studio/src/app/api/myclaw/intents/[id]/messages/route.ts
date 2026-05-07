// Reads paginated chat messages for an Intent ID, scoped to whichever
// claw this Studio instance is bound to.
//
// Auth: Supabase JWT validated against the cached JWKS for the
// project this claw is bound to. Owner-check on `sub`. See
// ../../../../../lib/myclaw/auth.ts for the validator + cache
// behavior.
//
// Storage backend: in v1, messages live on the local openclaw
// gateway's chat history. We fetch via the existing
// `executeGatewayIntent("chat.history", ...)` helper, then map the
// returned envelope into a SPA-friendly JSON shape.
//
// Pagination: `?limit=N&before=<message_id>` (cursor on message_id
// descending). Default limit 50; max 200. Response shape is
// `{ messages: [...], nextCursor: id|null }` so the SPA can drive
// infinite scroll without a count query.
//
// Errors:
//   401 — missing/invalid bearer (auth.ts.reason exposed in body)
//   403 — JWT valid but `sub` doesn't match this claw's owner
//   400 — bad cursor / bad limit
//   503 — gateway unreachable
//
// This file lives under /api/myclaw/** to keep the upstream's
// /api/intents/<verb> namespace untouched.

import { extractBearer, verifyMyclawToken } from '@/lib/myclaw/auth'
import { handlePreflight, respondWithCors } from '@/lib/myclaw/cors'
import {
    ensureDomainIntentRuntime
} from '@/lib/controlplane/intent-route'

export const runtime = 'nodejs'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

interface GatewayMessageEnvelope {
    id: string
    role: 'user' | 'assistant' | 'system'
    text: string
    createdAt: string
    agentKey?: string
}

export async function OPTIONS(request: Request) {
    return handlePreflight(request)
}

export async function GET(
    request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const { id: intentId } = await context.params
    if (!intentId) {
        return respondWithCors(
            request,
            JSON.stringify({ error: 'intentId required' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
    }

    const token = extractBearer(request)
    const verify = await verifyMyclawToken(token)
    if (!verify.ok) {
        const status = verify.reason === 'wrong_subject' ? 403 : 401
        return respondWithCors(
            request,
            JSON.stringify({ error: 'Unauthorized', reason: verify.reason }),
            {
                status,
                headers: { 'Content-Type': 'application/json' }
            }
        )
    }

    const url = new URL(request.url)
    const limitRaw = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
    const before = url.searchParams.get('before') ?? null
    const limit =
        Number.isFinite(limitRaw) && limitRaw > 0
            ? Math.min(Math.floor(limitRaw), MAX_LIMIT)
            : DEFAULT_LIMIT

    const runtimeOrError = await ensureDomainIntentRuntime()
    if (runtimeOrError instanceof Response) {
        // Mirror the runtime's status code through CORS.
        const body = await runtimeOrError.text()
        return respondWithCors(request, body, {
            status: runtimeOrError.status,
            headers: { 'Content-Type': 'application/json' }
        })
    }

    try {
        const payload = await runtimeOrError.callGateway<{
            messages: GatewayMessageEnvelope[]
            nextCursor: string | null
        }>('chat.history', {
            sessionKey: intentId,
            limit,
            before
        })
        return respondWithCors(
            request,
            JSON.stringify({
                messages: payload.messages,
                nextCursor: payload.nextCursor
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    } catch (err) {
        const message = err instanceof Error ? err.message : 'gateway error'
        return respondWithCors(
            request,
            JSON.stringify({
                error: 'gateway error',
                detail: message
            }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
    }
}
