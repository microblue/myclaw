import type { AuthenticatedContext } from '@/ts/Types'

import crypto from 'crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { partnerQuotas, channelPartners, auditLog } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

interface GrantBody {
    skuKind?: 'new_vm_day' | 'renewal_vm_day' | 'new_container_credit'
    validityDays?: number | null
    creditUsd?: number | null
    total?: number
    // If set, the new total replaces the existing one. Otherwise we add
    // to it (default — extend a partner's allowance without resetting).
    replace?: boolean
}

// Super-admin grants (or extends) a partner's per-SKU quota. Lifetime-
// keyed by validity_days OR credit_usd; the unique index in migration
// 0034 prevents dupe rows for the same shape.
//
// Default semantics is "extend": calling grant twice with total=50 leaves
// the partner with 100 total (50 + 50). Pass `replace: true` to overwrite.
// Used reuse is unaffected — reducing a partner's total below their
// already-used count is intentionally NOT permitted (would yield
// negative remaining; reject with 400).
const grantPartnerQuota = withErrorHandler('grantPartnerQuota')(
    async (c: AuthenticatedContext) => {
        const partnerId = c.req.param('id')
        if (!partnerId) return fail(c, 'partner id required.', 400)

        const body = await c.req
            .json<GrantBody>()
            .catch(() => ({}) as GrantBody)

        const skuKind = body.skuKind
        if (
            skuKind !== 'new_vm_day' &&
            skuKind !== 'renewal_vm_day' &&
            skuKind !== 'new_container_credit'
        )
            return fail(c, 'skuKind must be a known value.', 400)

        const validityDays =
            body.validityDays == null ? null : Number(body.validityDays)
        const creditUsd = body.creditUsd == null ? null : Number(body.creditUsd)

        if (skuKind.endsWith('_day')) {
            if (validityDays == null || validityDays < 1 || validityDays > 999)
                return fail(c, 'validityDays must be 1..999 for day SKUs.', 400)
        } else if (skuKind === 'new_container_credit') {
            if (creditUsd == null || creditUsd < 1)
                return fail(
                    c,
                    'creditUsd must be a positive integer for credit SKUs.',
                    400
                )
        }

        const total = Number(body.total ?? 0)
        if (!Number.isFinite(total) || total < 1)
            return fail(c, 'total must be a positive integer.', 400)

        const partner = await db
            .select({ userId: channelPartners.userId })
            .from(channelPartners)
            .where(eq(channelPartners.userId, partnerId))
            .limit(1)
            .then((rows) => rows[0])
        if (!partner) return fail(c, 'partner not found.', 404)

        const lifetimeMatch = and(
            eq(partnerQuotas.partnerId, partnerId),
            eq(partnerQuotas.skuKind, skuKind),
            validityDays != null
                ? eq(partnerQuotas.validityDays, validityDays)
                : isNull(partnerQuotas.validityDays),
            creditUsd != null
                ? eq(partnerQuotas.creditUsd, creditUsd)
                : isNull(partnerQuotas.creditUsd)
        )

        const existing = await db
            .select({
                total: partnerQuotas.total,
                used: partnerQuotas.used
            })
            .from(partnerQuotas)
            .where(lifetimeMatch)
            .limit(1)
            .then((rows) => rows[0])

        const before = existing ?? null

        // Compute the resulting total. Replace overwrites; extend adds.
        const nextTotal = body.replace
            ? total
            : (existing?.total ?? 0) + total

        // Refuse to drop total below already-used.
        if (existing && nextTotal < existing.used) {
            return fail(
                c,
                `Cannot reduce total below already-used (${existing.used}).`,
                400
            )
        }

        await db.transaction(async (tx) => {
            if (existing) {
                await tx
                    .update(partnerQuotas)
                    .set({
                        total: nextTotal,
                        updatedAt: new Date()
                    })
                    .where(lifetimeMatch)
            } else {
                await tx.insert(partnerQuotas).values({
                    partnerId,
                    skuKind,
                    validityDays,
                    creditUsd,
                    total: nextTotal,
                    used: 0,
                    createdAt: new Date(),
                    updatedAt: new Date()
                })
            }
            await tx.insert(auditLog).values({
                id: crypto.randomUUID(),
                actorId: c.get('userId'),
                actorRole: 'admin',
                action: 'partner_quota_grant',
                targetKind: 'partner',
                targetId: partnerId,
                beforeValue: before,
                afterValue: {
                    skuKind,
                    validityDays,
                    creditUsd,
                    total: nextTotal,
                    replace: !!body.replace
                },
                createdAt: new Date()
            })
        })

        return ok(
            c,
            {
                partnerId,
                skuKind,
                validityDays,
                creditUsd,
                total: nextTotal,
                used: existing?.used ?? 0
            },
            existing ? 'Quota updated.' : 'Quota granted.'
        )
    }
)

export default grantPartnerQuota