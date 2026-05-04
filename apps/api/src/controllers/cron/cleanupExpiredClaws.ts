import type { Context } from 'hono'

import { and, isNotNull, lt } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { cleanupClaw } from '@/controllers/claws/helpers'
import { ok } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

// Sweeps every claw whose `deletionScheduledAt` has passed and runs the
// existing cleanupClaw routine on it. Used by both:
//   - canceled-Polar subscriptions (scheduled by onSubscriptionRevoked.ts)
//   - activation-code claws past their validityMonths
//
// cleanupClaw deletes the row when it succeeds, so re-running the sweep
// is idempotent — successfully-cleaned claws drop out on the next pass.
const cleanupExpiredClaws = withErrorHandler('cleanupExpiredClaws')(async (
    c: Context
) => {
    const expired = await db
        .select({
            id: claws.id,
            provider: claws.provider,
            location: claws.location,
            providerServerId: claws.providerServerId,
            subdomain: claws.subdomain
        })
        .from(claws)
        .where(
            and(
                isNotNull(claws.deletionScheduledAt),
                lt(claws.deletionScheduledAt, new Date())
            )
        )

    const results = await Promise.allSettled(
        expired.map((claw) =>
            cleanupClaw(claw.id, {
                provider: claw.provider,
                location: claw.location,
                providerServerId: claw.providerServerId,
                subdomain: claw.subdomain
            })
        )
    )

    const succeeded = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.length - succeeded

    return ok(c, { swept: results.length, succeeded, failed })
})

export default cleanupExpiredClaws