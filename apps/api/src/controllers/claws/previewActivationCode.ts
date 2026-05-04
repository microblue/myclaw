import type { AuthenticatedContext } from '@/ts/Types'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { activationCodes } from '@/db/schema'
import { providerRegistry } from '@/services/providers'
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
        if (row.status === 'redeemed')
            return ok(c, { valid: false, reason: 'redeemed' as const }, '')
        if (row.status === 'voided')
            return ok(c, { valid: false, reason: 'voided' as const }, '')
        if (row.expiresAt && row.expiresAt < new Date())
            return ok(c, { valid: false, reason: 'expired' as const }, '')

        const provider = providerRegistry.getProvider(row.provider)
        let locations: { id: string; name: string }[] = []
        if (provider) {
            const all = await provider.getLocations()
            const availability = await provider.getPlanAvailability()
            const allowed = availability[row.planId]
            locations = all
                .filter((l) => !l.disabled)
                .filter((l) =>
                    allowed && allowed.length > 0
                        ? allowed.includes(l.id)
                        : true
                )
                .map((l) => ({ id: l.id, name: l.name }))
        }

        return ok(
            c,
            {
                valid: true,
                planId: row.planId,
                provider: row.provider,
                tierLabel: row.tierLabel,
                validityMonths: row.validityMonths,
                locations
            },
            ''
        )
    }
)

export default previewActivationCode