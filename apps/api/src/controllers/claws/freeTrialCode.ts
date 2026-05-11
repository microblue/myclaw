import type { AuthenticatedContext } from '@/ts/Types'

import { and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import { activationCodes } from '@/db/schema'
import users from '@/db/schema/users'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

// Free-trial issuance — hands the caller a pre-minted multi-seat code whose
// partner_name='system'. Idempotent: calling repeatedly returns the same
// available code without consuming anything. The per-user trial is only
// considered "used" once the code is actually redeemed (a claw is
// created) — that flag flip lives in redeemActivationCode so a user who
// asks for the code and then bails out can still try again later.
//
// One code, many seats (e.g. GHJYFJ6AS-003-050 = 3-day window, 50 seats).
// When the seat pool fills, an admin mints a fresh system code; this
// endpoint auto-picks the oldest still-available row.

const PARTNER_NAME = 'system'

const freeTrialCode = withErrorHandler('freeTrialCode')(
    async (c: AuthenticatedContext) => {
        const userId = c.get('userId')

        // Gate at read time — already-used users get 409. We do NOT
        // flip the flag here; that happens in redeemActivationCode when
        // a claw is successfully created. This way a user who hits the
        // button and walks away isn't permanently locked out.
        const userRow = await db
            .select({ usedFreeTrial: users.usedFreeTrial })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1)
            .then((rows) => rows[0])

        if (userRow?.usedFreeTrial) {
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