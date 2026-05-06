import type { AuthenticatedContext } from '@/ts/Types'

import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { userRole } from '@openclaw/shared'
import { db } from '@/db'
import {
    channelPartners,
    users,
    authUsers,
    auditLog
} from '@/db/schema'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

interface CreatePartnerBody {
    email?: string
    displayName?: string
    revenueSharePct?: number
}

// Super-admin promotes an existing end-user account into a channel
// partner. Per docs/aios-design.md §15.1: invite-only for v1 — the
// user must already exist in auth.users (i.e. have signed up); we just
// flip their role and create the channel_partners + initial empty
// quota state. Sending the invite email is a follow-up step (P5+).
const createPartner = withErrorHandler('createPartner')(
    async (c: AuthenticatedContext) => {
        const body = await c.req
            .json<CreatePartnerBody>()
            .catch(() => ({}) as CreatePartnerBody)

        const email = body.email?.trim().toLowerCase() || ''
        const displayName = body.displayName?.trim() || ''
        const revenueSharePct = Number(body.revenueSharePct ?? 0)

        if (!email) return fail(c, 'email is required.', 400)
        if (!displayName) return fail(c, 'displayName is required.', 400)
        if (
            !Number.isFinite(revenueSharePct) ||
            revenueSharePct < 0 ||
            revenueSharePct > 100
        )
            return fail(c, 'revenueSharePct must be between 0 and 100.', 400)

        const authRow = await db
            .select({ id: authUsers.id })
            .from(authUsers)
            .where(eq(authUsers.email, email))
            .limit(1)
            .then((rows) => rows[0])

        if (!authRow) {
            return fail(
                c,
                'No user found with that email — they must sign up first, then invite as partner.',
                404
            )
        }

        // Check for an existing partner row (idempotency — calling
        // create-partner twice on the same email shouldn't 500).
        const existing = await db
            .select({ userId: channelPartners.userId })
            .from(channelPartners)
            .where(eq(channelPartners.userId, authRow.id))
            .limit(1)
            .then((rows) => rows[0])

        if (existing) {
            return fail(c, 'That user is already a partner.', 409)
        }

        const beforeRole = await db
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, authRow.id))
            .limit(1)
            .then((rows) => rows[0])

        await db.transaction(async (tx) => {
            await tx
                .update(users)
                .set({ role: userRole.partner })
                .where(eq(users.id, authRow.id))
            await tx.insert(channelPartners).values({
                userId: authRow.id,
                displayName,
                status: 'active',
                revenueSharePct: String(revenueSharePct),
                createdAt: new Date(),
                updatedAt: new Date()
            })
            await tx.insert(auditLog).values({
                id: crypto.randomUUID(),
                actorId: c.get('userId'),
                actorRole: 'admin',
                action: 'partner_create',
                targetKind: 'user',
                targetId: authRow.id,
                beforeValue: { role: beforeRole?.role ?? null },
                afterValue: { role: userRole.partner, displayName },
                createdAt: new Date()
            })
        })

        return ok(
            c,
            {
                userId: authRow.id,
                email,
                displayName,
                status: 'active',
                revenueSharePct
            },
            'Partner created.'
        )
    }
)

export default createPartner