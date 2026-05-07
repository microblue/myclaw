import type { AuthenticatedContext } from '@/ts/Types'

import crypto from 'crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { intents, intentAgents, claws } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

interface CreateIntentBody {
    clawId?: string
    title?: string
}

// POST /api/intents
// Body: { clawId, title }
//
// Inserts a new Intent + bootstraps the default orchestrator agent in
// the same transaction. We need both rows for the SPA to render
// anything useful — an Intent without at least one orchestrator can't
// receive @-mentions and falls into a degenerate state.
//
// Title is trimmed; non-empty after trim is the only validation
// (mostly to surface "you sent whitespace" cleanly). Length cap of
// 160 chars is generous; the UI will truncate the rendered title.
const MAX_TITLE_LENGTH = 160

const createIntent = withErrorHandler('createIntent')(async (
    c: AuthenticatedContext
) => {
    const userId = c.get('userId')

    const body = await c.req
        .json<CreateIntentBody>()
        .catch(() => ({}) as CreateIntentBody)

    const clawId = body.clawId
    const title = (body.title ?? '').trim()

    if (!clawId) return fail(c, 'clawId is required.', 400)
    if (!title) return fail(c, 'title is required.', 400)
    if (title.length > MAX_TITLE_LENGTH)
        return fail(c, `title exceeds ${MAX_TITLE_LENGTH} characters.`, 400)

    const claw = await db
        .select({ id: claws.id })
        .from(claws)
        .where(and(eq(claws.id, clawId), eq(claws.userId, userId)))
        .limit(1)
        .then((r) => r[0])
    if (!claw) return fail(c, 'Claw not found.', 404)

    const id = crypto.randomUUID()
    await db.insert(intents).values({ id, clawId, userId, title })
    await db.insert(intentAgents).values({
        intentId: id,
        agentKey: 'orchestrator',
        displayName: 'Orchestrator',
        isOrchestrator: true
    })

    const created = await db
        .select()
        .from(intents)
        .where(eq(intents.id, id))
        .limit(1)
        .then((r) => r[0])

    return ok(c, created, 'Intent created.')
})

export default createIntent