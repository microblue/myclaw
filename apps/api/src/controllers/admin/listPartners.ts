import type { AuthenticatedContext } from '@/ts/Types'

import { desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { channelPartners, authUsers, partnerQuotas } from '@/db/schema'
import { ok } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

// Super-admin-only listing of registered channel partners. Joined with
// auth.users for email and aggregated against partner_quotas so the
// /admin/partners table can show "total / used" at a glance without
// a per-row follow-up request. Route gate (superAdminOnly) is applied
// at registration time.
const listPartners = withErrorHandler('listPartners')(
    async (c: AuthenticatedContext) => {
        const rows = await db
            .select({
                userId: channelPartners.userId,
                displayName: channelPartners.displayName,
                status: channelPartners.status,
                revenueSharePct: channelPartners.revenueSharePct,
                createdAt: channelPartners.createdAt,
                email: authUsers.email,
                quotaTotal: sql<number>`COALESCE(SUM(${partnerQuotas.total}), 0)::int`,
                quotaUsed: sql<number>`COALESCE(SUM(${partnerQuotas.used}), 0)::int`
            })
            .from(channelPartners)
            .leftJoin(authUsers, eq(authUsers.id, channelPartners.userId))
            .leftJoin(
                partnerQuotas,
                eq(partnerQuotas.partnerId, channelPartners.userId)
            )
            .groupBy(
                channelPartners.userId,
                channelPartners.displayName,
                channelPartners.status,
                channelPartners.revenueSharePct,
                channelPartners.createdAt,
                authUsers.email
            )
            .orderBy(desc(channelPartners.createdAt))

        return ok(c, { items: rows }, '')
    }
)

export default listPartners