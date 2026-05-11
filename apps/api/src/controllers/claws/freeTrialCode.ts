import type { AuthenticatedContext } from '@/ts/Types'

import { and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import { activationCodes } from '@/db/schema'
import users from '@/db/schema/users'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

// Free-trial issuance — hands the caller a pre-minted multi-seat code whose
// partner_name='system'. Seats are consumed by the standard redeem flow at
// claw-create time, so this endpoint only validates that a code is
// available and gates per-user via users.used_free_trial.
//
// One code, many seats (e.g. GHJYFJ6AS-003-050 = 3-day window, 50 seats).
// When the seat pool fills, an admin mints a fresh system code; this
// endpoint auto-picks the oldest still-available row.

const PARTNER_NAME = 'system'

const freeTrialCode = withErrorHandler('freeTrialCode')(
    async (c: AuthenticatedContext) => {
        const userId = c.get('userId')

        // CAS-style flip: only one in-flight call wins. If the user has
        // already used their trial, the WHERE clause matches zero rows
        // and we bail before touching the activation pool.
        const flipped = await db
            .update(users)
            .set({ usedFreeTrial: true })
            .where(
                and(eq(users.id, userId), eq(users.usedFreeTrial, false))
            )
            .returning({ id: users.id })

        if (flipped.length === 0) {
            return fail(c, 'You have already used your free trial.', 409)
        }

        // Pick the oldest system code that still has open seats and
        // hasn't been voided / hasn't expired. Ordering by created_at
        // means we drain old batches before new ones, which keeps
        // expiry handling predictable when an admin rotates batches.
        const now = new Date()
        const candidate = await db
            .select({
                code: activationCodes.code,
                validityDays: activationCodes.validityDays,
                planId: activationCodes.planId,
                provider: activationCodes.provider,
                region: activationCodes.region,
                tierLabel: activationCodes.tierLabel
            })
            .from(activationCodes)
            .where(
                and(
                    eq(activationCodes.partnerName, PARTNER_NAME),
                    eq(activationCodes.status, 'unused'),
                    sql`${activationCodes.seatsUsed} < ${activationCodes.seats}`,
                    or(
                        isNull(activationCodes.expiresAt),
                        gt(activationCodes.expiresAt, now)
                    ),
                    // Container codes get validity_days; container-credit
                    // codes would have credit_usd. Trial path is day-based
                    // only, so require validity_days to be set.
                    sql`${activationCodes.validityDays} IS NOT NULL`,
                    // skuKind='new' — renewals can't be the trial entry
                    // point. Defensive in case an operator mints a
                    // renewal system code by mistake.
                    eq(activationCodes.skuKind, 'new')
                )
            )
            .orderBy(asc(activationCodes.createdAt))
            .limit(1)
            .then((rows) => rows[0])

        if (!candidate) {
            // Roll back the user flag — the trial wasn't actually granted,
            // so they should be able to retry once an admin mints a new
            // system code.
            await db
                .update(users)
                .set({ usedFreeTrial: false })
                .where(eq(users.id, userId))
            return fail(
                c,
                'No free-trial seats are currently available. Please try again later.',
                503
            )
        }

        return ok(
            c,
            {
                code: candidate.code,
                validityDays: candidate.validityDays,
                planId: candidate.planId,
                provider: candidate.provider,
                region: candidate.region,
                tierLabel: candidate.tierLabel
            },
            'Free trial code issued.'
        )
    }
)

export default freeTrialCode