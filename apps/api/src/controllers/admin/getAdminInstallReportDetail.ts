import type { AuthenticatedContext } from '@/ts/Types'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { installReports } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const getAdminInstallReportDetail = withErrorHandler(
    'getAdminInstallReportDetail',
    'api.internalServerError'
)(async (c: AuthenticatedContext) => {
    const id = c.req.param('id')
    if (!id) return fail(c, 'Missing report id.', 400)

    const row = await db
        .select()
        .from(installReports)
        .where(eq(installReports.id, id))
        .then((rows) => rows[0])

    if (!row) return fail(c, 'Report not found.', 404)

    return ok(c, { report: row }, 'Install report loaded.')
})

export default getAdminInstallReportDetail