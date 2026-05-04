import type { AuthenticatedContext } from '@/ts/Types'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { activationCodes } from '@/db/schema'
import { fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const escape = (v: unknown): string => {
    if (v == null) return ''
    const s = String(v)
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
}

const exportActivationCodeBatch = withErrorHandler(
    'exportActivationCodeBatch'
)(async (c: AuthenticatedContext) => {
    const batchId = c.req.param('batchId')
    if (!batchId) return fail(c, 'batchId is required.', 400)

    const rows = await db
        .select()
        .from(activationCodes)
        .where(eq(activationCodes.batchId, batchId))

    if (rows.length === 0) return fail(c, 'Batch not found.', 404)

    const header = [
        'code',
        'plan_id',
        'provider',
        'region',
        'tier_label',
        'partner_name',
        'validity_months',
        'status',
        'expires_at',
        'created_at'
    ].join(',')

    const lines = rows.map((r) =>
        [
            r.code,
            r.planId,
            r.provider,
            r.region,
            r.tierLabel,
            r.partnerName,
            r.validityMonths,
            r.status,
            r.expiresAt ? r.expiresAt.toISOString() : '',
            r.createdAt.toISOString()
        ]
            .map(escape)
            .join(',')
    )

    const csv = [header, ...lines].join('\n') + '\n'

    return c.body(csv, 200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="activation-codes-${batchId}.csv"`
    })
})

export default exportActivationCodeBatch