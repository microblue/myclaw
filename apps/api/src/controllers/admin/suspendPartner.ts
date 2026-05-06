import type { AuthenticatedContext } from '@/ts/Types'

import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { channelPartners, auditLog } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

interface SuspendBody {
    status?: 'active' | 'suspended' | 'terminated'
}

// Super-admin flips a partner's status. Existing redeemed codes keep
// working regardless (per §14.3); status only governs login + future
// mints. Termination of unused codes is a separate sweep step.
const suspendPartner = withErrorHandler('suspendPartner')(
    async (c: AuthenticatedContext) => {
        const partnerId = c.req.param('id')
        if (!partnerId) return fail(c, 'partner id required.', 400)

        const body = await c.req
            .json<SuspendBody>()
            .catch(() => ({}) as SuspendBody)
        const next = body.status
        if (
            next !== 'active' &&
            next !== 'suspended' &&
            next !== 'terminated'
        )
            return fail(c, 'status must be active|suspended|terminated.', 400)

        const before = await db
            .select({ status: channelPartners.status })
            .from(channelPartners)
            .where(eq(channelPartners.userId, partnerId))
            .limit(1)
            .then((rows) => rows[0])

        if (!before) return fail(c, 'partner not found.', 404)

        if (before.status === next) {
            return ok(c, { userId: partnerId, status: next }, 'No change.')
        }

        await db.transaction(async (tx) => {
            await tx
                .update(channelPartners)
                .set({ status: next, updatedAt: new Date() })
                .where(eq(channelPartners.userId, partnerId))
            await tx.insert(auditLog).values({
                id: crypto.randomUUID(),
                actorId: c.get('userId'),
                actorRole: 'admin',
                action:
                    next === 'suspended'
                        ? 'partner_suspend'
                        : next === 'terminated'
                          ? 'partner_terminate'
                          : 'partner_reactivate',
                targetKind: 'partner',
                targetId: partnerId,
                beforeValue: { status: before.status },
                afterValue: { status: next },
                createdAt: new Date()
            })
        })

        return ok(c, { userId: partnerId, status: next }, 'Status updated.')
    }
)

export default suspendPartner