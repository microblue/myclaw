import type { Context } from 'hono'

import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { intents } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

interface LastPreviewBody {
    intentId?: string
    preview?: string
    at?: string
}

// POST /install/:clawId/intents/last-preview   (centralTokenAuth)
//
// Called by the claw after each chat turn to update the snapshot the
// /aios list view displays. The claw is the source of truth for chat
// content; this endpoint exists ONLY so the list view can render
// without a per-claw round-trip on page load.
//
// Authentication is the per-claw central_token (same middleware as
// the install/phase endpoint). The intent's claw_id MUST match the
// :clawId in the URL — otherwise a compromised claw could clobber
// previews on Intents that don't belong to it.
//
// `preview` is capped to 4 KB so a runaway claw can't pump megabytes
// per turn. The UI displays at most a single line, so there's no
// reason to accept more.
const MAX_PREVIEW_BYTES = 4 * 1024

const postLastPreview = withErrorHandler('postLastPreview')(async (
    c: Context
) => {
    const clawId = c.req.param('clawId')
    if (!clawId) return fail(c, 'clawId required.', 400)

    const body = await c.req
        .json<LastPreviewBody>()
        .catch(() => ({}) as LastPreviewBody)

    const intentId = body.intentId
    const previewRaw = body.preview ?? ''
    const at = body.at

    if (!intentId) return fail(c, 'intentId is required.', 400)

    const preview =
        previewRaw.length > MAX_PREVIEW_BYTES
            ? previewRaw.slice(0, MAX_PREVIEW_BYTES)
            : previewRaw

    const lastMessageAt = at ? new Date(at) : new Date()
    if (Number.isNaN(lastMessageAt.getTime())) {
        return fail(c, '`at` is not a valid ISO timestamp.', 400)
    }

    const updated = await db
        .update(intents)
        .set({
            lastMessagePreview: preview,
            lastMessageAt,
            updatedAt: new Date()
        })
        .where(and(eq(intents.id, intentId), eq(intents.clawId, clawId)))
        .returning({ id: intents.id })

    if (updated.length === 0) {
        // Unknown intent for this claw. Could be stale (intent deleted
        // server-side after the claw queued the push) or forged
        // (compromised claw trying to scribble on someone else's
        // intent). Either way, 404 — and we DON'T mention which.
        return fail(c, 'Intent not found for this claw.', 404)
    }

    return ok(c, { intentId }, '')
})

export default postLastPreview