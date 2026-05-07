import type { AuthenticatedContext } from '@/ts/Types'

import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { intents } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

interface UpdateIntentBody {
    title?: string
    archived?: boolean
}

// PATCH /api/intents/:id
// Body: { title?, archived? }
//
// Two operations on one endpoint because they're trivially small and
// always row-scoped. Archive is a soft delete: we set `archived_at`
// rather than deleting, so the user can restore. `archived: false`
// un-archives by clearing the timestamp.
//
// Authorization is "row owner" — the WHERE clause includes user_id so
// a user can never patch another user's Intent even if they guess
// the id (ULIDs make guessing impractical, but we don't rely on it).
const MAX_TITLE_LENGTH = 160

const updateIntent = withErrorHandler('updateIntent')(async (
    c: AuthenticatedContext
) => {
    const userId = c.get('userId')
    const id = c.req.param('id')
    if (!id) return fail(c, 'id required.', 400)

    const body = await c.req
        .json<UpdateIntentBody>()
        .catch(() => ({}) as UpdateIntentBody)

    const updates: Record<string, unknown> = {}

    if (body.title !== undefined) {
        const title = body.title.trim()
        if (!title) return fail(c, 'title cannot be empty.', 400)
        if (title.length > MAX_TITLE_LENGTH)
            return fail(c, `title exceeds ${MAX_TITLE_LENGTH} characters.`, 400)
        updates.title = title
    }

    if (body.archived !== undefined) {
        updates.archivedAt = body.archived ? new Date() : null
    }

    if (Object.keys(updates).length === 0)
        return fail(c, 'No fields to update.', 400)

    updates.updatedAt = new Date()

    const updated = await db
        .update(intents)
        .set(updates)
        .where(and(eq(intents.id, id), eq(intents.userId, userId)))
        .returning()

    if (updated.length === 0) return fail(c, 'Intent not found.', 404)

    return ok(c, updated[0], 'Intent updated.')
})

export default updateIntent