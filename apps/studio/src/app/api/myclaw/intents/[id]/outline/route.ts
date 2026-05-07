// Computes the outline (top-level sections + their first-message
// preview) for an Intent. Per docs/aios-design.md §6, outline is
// derived from local message history on the claw — there is no
// canonical outline column central-side. Each call walks the
// message log and groups by orchestrator-emitted "## section"
// markers.
//
// Result is cached in-process for 30s keyed by intentId so a busy
// SPA polling outline doesn't hammer the gateway. The cache key
// is per-Intent; rotating to a new Intent or restarting Studio
// drops the cache cleanly.
//
// Auth + CORS: same Supabase JWT bridge as messages/route.ts.

import { extractBearer, verifyMyclawToken } from '@/lib/myclaw/auth'
import { handlePreflight, respondWithCors } from '@/lib/myclaw/cors'
import { ensureDomainIntentRuntime } from '@/lib/controlplane/intent-route'

export const runtime = 'nodejs'

const OUTLINE_CACHE_TTL_MS = 30_000

interface OutlineNode {
    id: string
    title: string
    preview: string
    role: 'user' | 'assistant' | 'system'
    createdAt: string
}

interface CacheEntry {
    outline: OutlineNode[]
    expiresAt: number
}

const outlineCache = new Map<string, CacheEntry>()

const SECTION_HEADING_RE = /^##\s+(.+?)\s*$/m

interface GatewayMessage {
    id: string
    role: 'user' | 'assistant' | 'system'
    text: string
    createdAt: string
}

const computeOutline = (messages: GatewayMessage[]): OutlineNode[] => {
    const out: OutlineNode[] = []
    for (const m of messages) {
        if (m.role !== 'assistant') continue
        const match = m.text.match(SECTION_HEADING_RE)
        if (!match) continue
        const title = match[1].trim()
        if (!title) continue
        // First non-heading line as preview; falls back to the
        // heading itself if the message is just a heading.
        const lines = m.text.split('\n')
        const previewLine = lines.find(
            (l) => l.trim() && !SECTION_HEADING_RE.test(l)
        )
        out.push({
            id: m.id,
            title,
            preview: (previewLine ?? title).slice(0, 200),
            role: m.role,
            createdAt: m.createdAt
        })
    }
    return out
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

    const cached = outlineCache.get(intentId)
    if (cached && cached.expiresAt > Date.now()) {
        return respondWithCors(
            request,
            JSON.stringify({ outline: cached.outline, cached: true }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    }

    const runtimeOrError = await ensureDomainIntentRuntime()
    if (runtimeOrError instanceof Response) {
        const body = await runtimeOrError.text()
        return respondWithCors(request, body, {
            status: runtimeOrError.status,
            headers: { 'Content-Type': 'application/json' }
        })
    }

    try {
        // We pull a generous slice — outline is only useful when
        // the user is reviewing structure, so fetching the full log
        // (capped at 1000 messages) trades RAM for fewer round-trips.
        const payload = await runtimeOrError.callGateway<{
            messages: GatewayMessage[]
        }>('chat.history', {
            sessionKey: intentId,
            limit: 1000,
            before: null
        })
        const outline = computeOutline(payload.messages)
        outlineCache.set(intentId, {
            outline,
            expiresAt: Date.now() + OUTLINE_CACHE_TTL_MS
        })
        return respondWithCors(
            request,
            JSON.stringify({ outline, cached: false }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    } catch (err) {
        const message = err instanceof Error ? err.message : 'gateway error'
        return respondWithCors(
            request,
            JSON.stringify({ error: 'gateway error', detail: message }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
    }
}
