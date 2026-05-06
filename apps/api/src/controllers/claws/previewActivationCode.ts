import type { AuthenticatedContext } from '@/ts/Types'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { activationCodes } from '@/db/schema'
import { ok } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

interface PreviewBody {
    code?: string
}

const previewActivationCode = withErrorHandler('previewActivationCode')(
    async (c: AuthenticatedContext) => {
        const body = await c.req
            .json<PreviewBody>()
            .catch(() => ({}) as PreviewBody)
        const code = String(body.code || '').trim()

        if (!code)
            return ok(c, { valid: false, reason: 'not_found' as const }, '')

        const row = await db
            .select()
            .from(activationCodes)
            .where(eq(activationCodes.code, code))
            .limit(1)
            .then((rows) => rows[0])

        if (!row)
            return ok(c, { valid: false, reason: 'not_found' as const }, '')
        if (row.status === 'voided')
            return ok(c, { valid: false, reason: 'voided' as const }, '')
        if (row.status === 'redeemed' || row.seatsUsed >= row.seats)
            return ok(c, { valid: false, reason: 'redeemed' as const }, '')
        if (row.expiresAt && row.expiresAt < new Date())
            return ok(c, { valid: false, reason: 'expired' as const }, '')

        return ok(
            c,
            {
                valid: true,
                skuKind: row.skuKind,
                planId: row.planId,
                provider: row.provider,
                region: row.region,
                tierLabel: row.tierLabel,
                validityDays: row.validityDays,
                seats: row.seats,
                seatsUsed: row.seatsUsed,
                seatsRemaining: row.seats - row.seatsUsed
            },
            ''
        )
    }
)

export default previewActivationCode