import type { AuthenticatedContext } from '@/ts/Types'

import crypto from 'crypto'
import { db } from '@/db'
import { activationCodes } from '@/db/schema'
import { providerRegistry } from '@/services/providers'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

interface CreateBatchBody {
    planId?: string
    provider?: string
    tierLabel?: string | null
    partnerName?: string | null
    notes?: string | null
    validityMonths?: number | null
    expiresAt?: string | null  // ISO 8601 — when the code itself stops being redeemable
    count?: number
}

// Crockford-style base32 minus 0/O/I/1 to keep codes phone-typable. Codes
// look like GL-XXXX-XXXX-XXXX (12 chars + dashes, ~60 bits of entropy).
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const SEGMENT_LEN = 4

const randomSegment = () => {
    const buf = crypto.randomBytes(SEGMENT_LEN)
    let out = ''
    for (let i = 0; i < SEGMENT_LEN; i += 1) {
        out += ALPHABET[buf[i] % ALPHABET.length]
    }
    return out
}

const mintCode = () =>
    `GL-${randomSegment()}-${randomSegment()}-${randomSegment()}`

const MAX_BATCH_SIZE = 1000

const createActivationCodeBatch = withErrorHandler(
    'createActivationCodeBatch'
)(async (c: AuthenticatedContext) => {
    const body = await c.req
        .json<CreateBatchBody>()
        .catch(() => ({}) as CreateBatchBody)
    const planId = String(body.planId || '').trim()
    const providerId = String(body.provider || 'hetzner').trim()
    const partnerName = body.partnerName?.trim() || null
    const tierLabel = body.tierLabel?.trim() || null
    const notes = body.notes?.trim() || null
    const validityMonths =
        body.validityMonths == null ? null : Number(body.validityMonths)
    const count = Math.max(
        1,
        Math.min(MAX_BATCH_SIZE, Number(body.count || 1))
    )

    if (!planId) return fail(c, 'planId is required.', 400)
    if (validityMonths != null && (!Number.isInteger(validityMonths) || validityMonths < 1))
        return fail(c, 'validityMonths must be a positive integer or null.', 400)

    const provider = providerRegistry.getProvider(providerId)
    if (!provider) return fail(c, 'Provider is not available.', 400)

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
        code: mintCode(),
        planId,
        provider: providerId,
        tierLabel,
        partnerName,
        batchId,
        notes,
        validityMonths,
        status: 'unused',
        expiresAt,
        createdAt,
        createdByUserId
    }))

    // Insert one statement; conflicts on the unique `code` are vanishingly
    // rare (~60 bits) but we still surface them rather than swallow.
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