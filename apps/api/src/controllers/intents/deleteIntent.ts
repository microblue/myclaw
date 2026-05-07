import type { AuthenticatedContext } from '@/ts/Types'

import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { intents } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

// DELETE /api/intents/:id
//
// Hard delete — cascades to intent_agents + intent_artifacts via the
// FK ON DELETE CASCADE clauses defined in 0036_intents.sql. The bytes
// the artifact pointers reference live on the claw and are NOT
// deleted by this call; the SPA is expected to fire a separate cleanup
// to the claw. We accept that risk in favor of a fast central call —
// orphan artifacts on a claw are cheap and a future scrubber can find
// them by intent_id.
const deleteIntent = withErrorHandler('deleteIntent')(async (
    c: AuthenticatedContext
) => {
    const userId = c.get('userId')
    const id = c.req.param('id')
    if (!id) return fail(c, 'id required.', 400)

    const deleted = await db
        .delete(intents)
        .where(and(eq(intents.id, id), eq(intents.userId, userId)))
        .returning({ id: intents.id })

    if (deleted.length === 0) return fail(c, 'Intent not found.', 404)

    return ok(c, { id }, 'Intent deleted.')
})

export default deleteIntent