import type { AuthenticatedContext } from '@/ts/Types'

import crypto from 'crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { intents, intentAgents, claws } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

// GET /api/claws/:clawId/intents
//
// Lists the user's Intents on the given claw. Two pieces of access
// control matter here:
// 1. The claw must belong to the calling user — otherwise listing one
//    user's claw under another user's session would leak Intent
//    titles + previews.
// 2. We always filter by user_id, even though (1) already pins the
//    claw to the user. Belt + suspenders for the eventual shared-claw
//    feature where one claw could host multiple users' Intents.
//
// Excludes archived Intents by default; `?includeArchived=1` opts in.
const listIntents = withErrorHandler('listIntents')(async (
    c: AuthenticatedContext
) => {
    const userId = c.get('userId')
    const clawId = c.req.param('clawId')
    if (!clawId) return fail(c, 'clawId required.', 400)

    const includeArchived = c.req.query('includeArchived') === '1'

    const claw = await db
        .select({ id: claws.id })
        .from(claws)
        .where(and(eq(claws.id, clawId), eq(claws.userId, userId)))
        .limit(1)
        .then((r) => r[0])
    if (!claw) return fail(c, 'Claw not found.', 404)

    const where = includeArchived
        ? and(eq(intents.clawId, clawId), eq(intents.userId, userId))
        : and(
              eq(intents.clawId, clawId),
              eq(intents.userId, userId),
              isNull(intents.archivedAt)
          )

    const rows = await db
        .select()
        .from(intents)
        .where(where)
        .orderBy(desc(intents.lastMessageAt), desc(intents.createdAt))

    // Backfill the per-claw default Intent on first list. This is the
    // "Workspace" Intent referenced in design §10 — every claw needs
    // at least one so the UI never opens to an empty list. We do this
    // eagerly here (not on visit-only) so a re-install or first load
    // both end up in the same shape.
    if (rows.length === 0) {
        const defaultId = crypto.randomUUID()
        await db.insert(intents).values({
            id: defaultId,
            clawId,
            userId,
            title: 'Workspace'
        })
        await db.insert(intentAgents).values({
            intentId: defaultId,
            agentKey: 'orchestrator',
            displayName: 'Orchestrator',
            isOrchestrator: true
        })
        const fresh = await db
            .select()
            .from(intents)
            .where(eq(intents.id, defaultId))
            .limit(1)
            .then((r) => r[0])
        return ok(c, fresh ? [fresh] : [], '')
    }

    return ok(c, rows, '')
})

export default listIntents