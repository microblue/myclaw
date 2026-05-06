import type { AuthenticatedContext } from '@/ts/Types'

import { sql, isNotNull } from 'drizzle-orm'
import { db } from '@/db'
import { activationCodes } from '@/db/schema'
import { ok } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

// One row per batchId. Aggregates code counts by status in a single
// pass. Per-batch metadata (planId, provider, region, validityDays,
// skuKind, seats, partnerName, expiresAt, tierLabel) is shared across
// every code in the batch, so MIN/MAX picks one deterministically.
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
            validityDays: sql<number | null>`MAX(${activationCodes.validityDays})`,
            skuKind: sql<string>`MAX(${activationCodes.skuKind})`,
            seats: sql<number>`MAX(${activationCodes.seats})`,
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