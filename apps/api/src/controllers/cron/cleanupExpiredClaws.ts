import type { Context } from 'hono'

import { and, isNotNull, lt } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { cleanupClaw } from '@/controllers/claws/helpers'
import { ok } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

export type CleanupResult = {
    swept: number
    succeeded: number
    failed: number
}

export async function runCleanupExpiredClaws(): Promise<CleanupResult> {
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
    return { swept: results.length, succeeded, failed }
}

const cleanupExpiredClaws = withErrorHandler('cleanupExpiredClaws')(async (
    c: Context
) => {
    const result = await runCleanupExpiredClaws()
    return ok(c, result)
})

export default cleanupExpiredClaws