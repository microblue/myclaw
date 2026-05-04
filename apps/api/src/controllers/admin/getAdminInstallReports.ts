import type { AuthenticatedContext } from '@/ts/Types'

import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { db } from '@/db'
import { installReports } from '@/db/schema'
import { ok } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const getAdminInstallReports = withErrorHandler(
    'getAdminInstallReports',
    'api.internalServerError'
)(async (c: AuthenticatedContext) => {
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
    const limit = Math.min(
        100,
        Math.max(1, parseInt(c.req.query('limit') || '20', 10))
    )
    const offset = (page - 1) * limit
    const search = c.req.query('search')?.trim() || ''
    const phase = c.req.query('phase')?.trim() || ''

    const filters: SQL[] = []
    if (search) {
        // Cheap ilike scan over the human-identifiable columns. Table is
        // expected to stay small (one row per failed install attempt).
        const fuzzy = or(
            ilike(installReports.hostname, `%${search}%`),
            ilike(installReports.username, `%${search}%`),
            ilike(installReports.installId, `%${search}%`),
            ilike(installReports.desktopVersion, `%${search}%`),
            ilike(installReports.errorMessage, `%${search}%`)
        )
        if (fuzzy) filters.push(fuzzy)
    }
    if (phase) filters.push(eq(installReports.bootstrapPhase, phase))

    const whereClause =
        filters.length === 0
            ? undefined
            : filters.length === 1
              ? filters[0]
              : and(...filters)

    const [totalResult, rows] = await Promise.all([
        db.select({ count: count() }).from(installReports).where(whereClause),
        db
            .select({
                id: installReports.id,
                installId: installReports.installId,
                desktopVersion: installReports.desktopVersion,
                platform: installReports.platform,
                arch: installReports.arch,
                hostname: installReports.hostname,
                username: installReports.username,
                bootstrapPhase: installReports.bootstrapPhase,
                errorMessage: installReports.errorMessage,
                createdAt: installReports.createdAt
            })
            .from(installReports)
            .where(whereClause)
            .orderBy(desc(installReports.createdAt))
            .limit(limit)
            .offset(offset)
    ])

    const total = totalResult[0]?.count || 0
    const totalPages = Math.ceil(total / limit)

    return ok(
        c,
        { items: rows, total, totalPages, page, limit },
        'Install reports loaded.'
    )
})

export default getAdminInstallReports