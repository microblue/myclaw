import type { AuthenticatedContext } from '@/ts/Types'

import crypto from 'crypto'
import { db } from '@/db'
import { activationCodes } from '@/db/schema'
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
    expiresAt?: string | null
    count?: number
}

// Crockford base32 minus 0/O/I/1 — phone-typable. Code format follows
// the white-paper appendix A spec: xxxxxxxxx-ddd-uuu where ddd is
// validity days zero-padded to 3 digits and uuu is max seats zero-padded
// to 3. So a 5-device 90-day code looks like ABCDEFGHJ-090-005.
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
    // `?? 1` not `|| 1`: `seats: 0` from a malformed client should hit the
    // ALLOWED_SEATS guard below, not silently become 1.
    const seats = Number(body.seats ?? 1)
    const count = Math.max(
        1,
        Math.min(MAX_BATCH_SIZE, Number(body.count ?? 1))
    )

    if (validityDays == null || validityDays < 1 || validityDays > 999)
        return fail(c, 'validityDays must be an integer 1..999.', 400)
    if (!ALLOWED_SEATS.has(seats))
        return fail(c, 'seats must be one of 1, 5, 25, 50.', 400)

    // Renewal codes are plan-agnostic: the redemption flow asks the
    // user which existing claw to extend, and we validate that the
    // claw's plan/provider matches the code's at redeem time. So
    // renewal codes can be minted with no planId/provider/region.
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

    const batchId = `batch-${crypto.randomUUID()}`
    const createdByUserId = c.get('userId')
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
        batchId,
        notes,
        validityDays,
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