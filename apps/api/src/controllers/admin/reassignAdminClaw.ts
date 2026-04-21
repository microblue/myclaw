import type { AuthenticatedContext } from '@/ts/Types'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws, users } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'
import withErrorHandler from '@/lib/withErrorHandler'

// PUT /admin/claws/:id/owner  body: { userId }
//
// Reassigns a claw to a different user. Used for ownership transfer
// (email changes, account merges, billing disputes). The underlying
// Polar subscription stays on the claw — the new owner inherits
// billing from this point forward, which is the expected semantics
// for a transfer.

const reassignAdminClaw = withErrorHandler(
    'reassignAdminClaw',
    'api.failedToReassignClaw'
)(async (c: AuthenticatedContext) => {
    const clawId = c.req.param('id')
    if (!clawId) return fail(c, t('api.clawNotFound'), 404)

    const body = await c.req.json().catch(() => null)
    const newUserId = (body as { userId?: unknown } | null)?.userId
    if (!newUserId || typeof newUserId !== 'string') {
        return fail(c, t('api.badRequest'), 400)
    }

    const [existingClaw] = await db
        .select({ id: claws.id, userId: claws.userId, name: claws.name })
        .from(claws)
        .where(eq(claws.id, clawId))
        .limit(1)
    if (!existingClaw) return fail(c, t('api.clawNotFound'), 404)

    const [newOwner] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, newUserId))
        .limit(1)
    if (!newOwner) return fail(c, t('api.userNotFound'), 404)

    if (existingClaw.userId === newUserId) {
        return ok(c, { userId: newUserId }, t('api.clawOwnerUnchanged'))
    }

    await db
        .update(claws)
        .set({ userId: newUserId })
        .where(eq(claws.id, clawId))

    return ok(
        c,
        { userId: newUserId, ownerEmail: newOwner.email },
        t('api.clawOwnerUpdated')
    )
})

export default reassignAdminClaw