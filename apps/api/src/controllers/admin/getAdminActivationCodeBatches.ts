import type { AuthenticatedContext } from '@/ts/Types'

import { sql, isNotNull } from 'drizzle-orm'
import { db } from '@/db'
import { activationCodes } from '@/db/schema'
import { ok } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

// One row per batchId. We aggregate counts by status in a single pass
// instead of N queries. Per-batch metadata (planId, provider, region,
// validityMonths, partnerName, expiresAt, tierLabel) is shared across
// every code in the batch, so MIN() / MAX() picks one deterministically
// without a separate join.
const getAdminActivationCodeBatches = withErrorHandler(
    'getAdminActivationCodeBatches'
)(async (c: AuthenticatedContext) => {
    const rows = await db
        .select({
            batchId: activationCodes.batchId,
            partnerName: sql<string | null>`MAX(${activationCodes.partnerName})`,
            planId: sql<string>`MAX(${activationCodes.planId})`,
            provider: sql<string>`MAX(${activationCodes.provider})`,
            region: sql<string>`MAX(${activationCodes.region})`,
            tierLabel: sql<string | null>`MAX(${activationCodes.tierLabel})`,
            validityMonths: sql<number | null>`MAX(${activationCodes.validityMonths})`,
            expiresAt: sql<Date | null>`MAX(${activationCodes.expiresAt})`,
            createdAt: sql<Date>`MIN(${activationCodes.createdAt})`,
            total: sql<number>`COUNT(*)::int`,
            unused: sql<number>`SUM(CASE WHEN ${activationCodes.status} = 'unused' THEN 1 ELSE 0 END)::int`,
            redeemed: sql<number>`SUM(CASE WHEN ${activationCodes.status} = 'redeemed' THEN 1 ELSE 0 END)::int`,
            voided: sql<number>`SUM(CASE WHEN ${activationCodes.status} = 'voided' THEN 1 ELSE 0 END)::int`
        })
        .from(activationCodes)
        .where(isNotNull(activationCodes.batchId))
        .groupBy(activationCodes.batchId)
        .orderBy(sql`MIN(${activationCodes.createdAt}) DESC`)

    return ok(c, { items: rows }, '')
})

export default getAdminActivationCodeBatches