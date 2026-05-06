import type { AuthenticatedContext } from '@/ts/Types'

import crypto from 'crypto'
import { and, eq, sql, isNull } from 'drizzle-orm'
import { userRole } from '@openclaw/shared'
import { db } from '@/db'
import {
    activationCodes,
    channelPartners,
    partnerQuotas
} from '@/db/schema'
import { providerRegistry } from '@/services/providers'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

interface CreateBatchBody {
    skuKind?: 'new' | 'renewal'
    planId?: string
    provider?: string
    region?: string
    tierLabel?: string | null
    partnerName?: string | null
    notes?: string | null
    validityDays?: number | null
    seats?: number
    creditUsd?: number | null
    expiresAt?: string | null
    count?: number
}

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const RANDOM_LEN = 9

const randomSegment = (length: number): string => {
    const buf = crypto.randomBytes(length)
    let out = ''
    for (let i = 0; i < length; i += 1) {
        out += ALPHABET[buf[i] % ALPHABET.length]
    }
    return out
}

const pad3 = (n: number): string => String(n).padStart(3, '0')

const mintCode = (validityDays: number, seats: number) =>
    `${randomSegment(RANDOM_LEN)}-${pad3(validityDays)}-${pad3(seats)}`

const MAX_BATCH_SIZE = 1000
const ALLOWED_SEATS = new Set([1, 5, 25, 50])

// Maps the activation_code.sku_kind ('new'|'renewal') + lifetime shape
// (day-based vs credit-based) to the granular partner_quotas.sku_kind.
// Container-credit support is sketched here to match the schema, but
// the controller doesn't yet expose creditUsd in CreateBatchBody — that
// ships with P2c (Fly variant).
const resolveQuotaSku = (
    skuKind: 'new' | 'renewal',
    creditUsd: number | null
): string => {
    if (creditUsd != null) return 'new_container_credit'
    return skuKind === 'renewal' ? 'renewal_vm_day' : 'new_vm_day'
}

const createActivationCodeBatch = withErrorHandler(
    'createActivationCodeBatch'
)(async (c: AuthenticatedContext) => {
    const body = await c.req
        .json<CreateBatchBody>()
        .catch(() => ({}) as CreateBatchBody)

    const skuKind = body.skuKind === 'renewal' ? 'renewal' : 'new'
    const partnerName = body.partnerName?.trim() || null
    const tierLabel = body.tierLabel?.trim() || null
    const notes = body.notes?.trim() || null
    const validityDays =
        body.validityDays == null ? null : Number(body.validityDays)
    const creditUsd = body.creditUsd == null ? null : Number(body.creditUsd)
    const seats = Number(body.seats ?? 1)
    const count = Math.max(
        1,
        Math.min(MAX_BATCH_SIZE, Number(body.count ?? 1))
    )

    if (validityDays == null || validityDays < 1 || validityDays > 999)
        return fail(c, 'validityDays must be an integer 1..999.', 400)
    if (!ALLOWED_SEATS.has(seats))
        return fail(c, 'seats must be one of 1, 5, 25, 50.', 400)

    // Role-based partner quota gate runs BEFORE provider validation
    // because: (a) failing fast on unauthorised callers avoids leaking
    // provider/plan validity to them, (b) the middleware that gates
    // this route should already be partnerOrSuperAdmin, but this is
    // defense in depth.
    const callerRole = c.get('userRole')
    const callerId = c.get('userId')
    let partnerId: string | null = null

    if (
        callerRole !== userRole.admin &&
        callerRole !== userRole.partner
    ) {
        return fail(c, 'Only super-admins or registered partners can mint.', 403)
    }

    if (callerRole === userRole.partner) {
        const partnerRow = await db
            .select({ userId: channelPartners.userId })
            .from(channelPartners)
            .where(eq(channelPartners.userId, callerId))
            .limit(1)
            .then((rows) => rows[0])
        if (!partnerRow) {
            return fail(
                c,
                'No partner account is registered for your user — contact support.',
                403
            )
        }
        partnerId = partnerRow.userId
    }

    const planId = body.planId?.trim() || null
    const providerId = body.provider?.trim() || null
    const region = body.region?.trim() || null

    if (skuKind === 'new') {
        if (!planId) return fail(c, 'planId is required for new-claw codes.', 400)
        if (!providerId)
            return fail(c, 'provider is required for new-claw codes.', 400)
        if (!region) return fail(c, 'region is required for new-claw codes.', 400)

        const provider = providerRegistry.getProvider(providerId)
        if (!provider) return fail(c, 'Provider is not available.', 400)

        const [locations, availability] = await Promise.all([
            provider.getLocations(),
            provider.getPlanAvailability()
        ])
        const matchedLocation = locations.find((l) => l.id === region)
        if (!matchedLocation || matchedLocation.disabled)
            return fail(
                c,
                `Region "${region}" is not a valid location for ${providerId}.`,
                400
            )
        const allowed = availability[planId]
        if (allowed && allowed.length > 0 && !allowed.includes(region))
            return fail(
                c,
                `Plan "${planId}" is not available in region "${region}".`,
                400
            )
    }

    let expiresAt: Date | null = null
    if (body.expiresAt) {
        expiresAt = new Date(body.expiresAt)
        if (Number.isNaN(expiresAt.getTime()))
            return fail(c, 'expiresAt is not a valid date.', 400)
    }

    if (callerRole === userRole.partner && partnerId) {
        const quotaSku = resolveQuotaSku(skuKind, creditUsd)
        const quotaRow = await db
            .select({
                total: partnerQuotas.total,
                used: partnerQuotas.used
            })
            .from(partnerQuotas)
            .where(
                and(
                    eq(partnerQuotas.partnerId, partnerId),
                    eq(partnerQuotas.skuKind, quotaSku),
                    validityDays != null
                        ? eq(partnerQuotas.validityDays, validityDays)
                        : isNull(partnerQuotas.validityDays),
                    creditUsd != null
                        ? eq(partnerQuotas.creditUsd, creditUsd)
                        : isNull(partnerQuotas.creditUsd)
                )
            )
            .limit(1)
            .then((rows) => rows[0])

        if (!quotaRow) {
            return fail(
                c,
                `No quota allocation for ${quotaSku} @ ${validityDays}d / ${creditUsd ?? '—'}USD. Ask super-admin to grant one.`,
                400
            )
        }
        const requested = count * seats
        if (quotaRow.used + requested > quotaRow.total) {
            return fail(
                c,
                `Quota exceeded — ${quotaRow.total - quotaRow.used} of ${quotaRow.total} seats remaining; you requested ${requested}.`,
                400
            )
        }

        // CAS-style consume: increments used by `requested` only if it
        // still fits. Race with another concurrent mint is detected via
        // returning() yielding 0 rows.
        const claimed = await db
            .update(partnerQuotas)
            .set({
                used: sql`${partnerQuotas.used} + ${requested}`,
                updatedAt: new Date()
            })
            .where(
                and(
                    eq(partnerQuotas.partnerId, partnerId),
                    eq(partnerQuotas.skuKind, quotaSku),
                    validityDays != null
                        ? eq(partnerQuotas.validityDays, validityDays)
                        : isNull(partnerQuotas.validityDays),
                    creditUsd != null
                        ? eq(partnerQuotas.creditUsd, creditUsd)
                        : isNull(partnerQuotas.creditUsd),
                    sql`${partnerQuotas.used} + ${requested} <= ${partnerQuotas.total}`
                )
            )
            .returning({ partnerId: partnerQuotas.partnerId })

        if (claimed.length === 0) {
            return fail(
                c,
                'Quota race lost — another mint consumed the remaining allocation. Try again.',
                400
            )
        }
    }

    const batchId = `batch-${crypto.randomUUID()}`
    const createdByUserId = callerId
    const createdAt = new Date()

    const rows = Array.from({ length: count }).map(() => ({
        id: crypto.randomUUID(),
        code: mintCode(validityDays, seats),
        skuKind,
        planId,
        provider: providerId,
        region,
        tierLabel,
        partnerName,
        partnerId,
        batchId,
        notes,
        validityDays,
        creditUsd,
        seats,
        seatsUsed: 0,
        status: 'unused',
        expiresAt,
        createdAt,
        createdByUserId
    }))

    const inserted = await db
        .insert(activationCodes)
        .values(rows)
        .returning({
            id: activationCodes.id,
            code: activationCodes.code
        })

    return ok(
        c,
        {
            batchId,
            count: inserted.length,
            codes: inserted
        },
        'Activation code batch created.'
    )
})

export default createActivationCodeBatch