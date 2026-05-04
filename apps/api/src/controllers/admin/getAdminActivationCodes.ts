import type { AuthenticatedContext } from '@/ts/Types'

import { count, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { activationCodes, users, claws } from '@/db/schema'
import { ok } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const getAdminActivationCodes = withErrorHandler(
    'getAdminActivationCodes'
)(async (c: AuthenticatedContext) => {
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
    const limit = Math.min(
        100,
        Math.max(1, parseInt(c.req.query('limit') || '50', 10))
    )
    const offset = (page - 1) * limit
    const status = c.req.query('status') || ''
    const partner = c.req.query('partner') || ''
    const batch = c.req.query('batch') || ''

    const conditions = []
    if (status) conditions.push(eq(activationCodes.status, status))
    if (partner) conditions.push(eq(activationCodes.partnerName, partner))
    if (batch) conditions.push(eq(activationCodes.batchId, batch))

    const whereClause =
        conditions.length > 0
            ? sql`${sql.join(
                  conditions.map((cond) => sql`(${cond})`),
                  sql` AND `
              )}`
            : undefined

    const [totalResult, rows] = await Promise.all([
        db
            .select({ count: count() })
            .from(activationCodes)
            .where(whereClause),
        db
            .select({
                id: activationCodes.id,
                code: activationCodes.code,
                planId: activationCodes.planId,
                provider: activationCodes.provider,
                tierLabel: activationCodes.tierLabel,
                partnerName: activationCodes.partnerName,
                batchId: activationCodes.batchId,
                notes: activationCodes.notes,
                validityMonths: activationCodes.validityMonths,
                status: activationCodes.status,
                redeemedByUserId: activationCodes.redeemedByUserId,
                redeemedClawId: activationCodes.redeemedClawId,
                redeemedAt: activationCodes.redeemedAt,
                expiresAt: activationCodes.expiresAt,
                createdAt: activationCodes.createdAt,
                redeemedByEmail: users.email,
                redeemedClawName: claws.name
            })
            .from(activationCodes)
            .leftJoin(users, eq(users.id, activationCodes.redeemedByUserId))
            .leftJoin(claws, eq(claws.id, activationCodes.redeemedClawId))
            .where(whereClause)
            .orderBy(desc(activationCodes.createdAt))
            .limit(limit)
            .offset(offset)
    ])

    const total = totalResult[0]?.count || 0
    const totalPages = Math.ceil(total / limit)

    return ok(
        c,
        {
            items: rows,
            total,
            page,
            totalPages
        },
        ''
    )
})

export default getAdminActivationCodes