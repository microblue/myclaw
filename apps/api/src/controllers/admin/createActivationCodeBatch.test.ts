import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
    insertCalls: [] as unknown[][],
    mockGetProvider: vi.fn()
}))

vi.mock('@/db', () => {
    let lastValues: unknown = null
    return {
        db: {
            insert: () => ({
                values: (rows: unknown) => {
                    lastValues = rows
                    h.insertCalls.push([rows])
                    return {
                        returning: async () =>
                            (rows as Array<{ id: string; code: string }>).map(
                                (r) => ({ id: r.id, code: r.code })
                            )
                    }
                }
            }),
            _peekLastValues: () => lastValues
        }
    }
})

vi.mock('@/db/schema', () => ({
    activationCodes: { id: 'activationCodes.id', code: 'activationCodes.code' }
}))

vi.mock('@/services/providers', () => ({
    providerRegistry: { getProvider: h.mockGetProvider }
}))

vi.mock('@openclaw/i18n', () => ({
    t: (key: string) => key
}))

import createActivationCodeBatch from './createActivationCodeBatch'

interface BodyShape {
    skuKind?: 'new' | 'renewal'
    planId?: string | null
    provider?: string | null
    region?: string | null
    tierLabel?: string | null
    partnerName?: string | null
    notes?: string | null
    validityDays?: number | null
    seats?: number
    expiresAt?: string | null
    count?: number
}

const callMint = async (body: BodyShape | undefined, userId = 'admin-1') => {
    const calls: Array<{ body: unknown; status: number }> = []
    const c = {
        req: {
            json: vi.fn(async () => body ?? {})
        },
        get: vi.fn(() => userId),
        json: vi.fn((b: unknown, status: number = 200) => {
            calls.push({ body: b, status })
            return { body: b, status } as unknown as Response
        })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createActivationCodeBatch(c as any)
    return { calls, body: calls[0]?.body, status: calls[0]?.status }
}

const validProvider = (
    overrides: {
        locations?: Array<{ id: string; disabled: boolean }>
        availability?: Record<string, string[]>
    } = {}
) => ({
    getLocations: vi.fn(async () =>
        overrides.locations ?? [
            { id: 'fsn1', name: 'Falkenstein', country: 'DE', disabled: false }
        ]
    ),
    getPlanAvailability: vi.fn(async () =>
        overrides.availability ?? { cpx21: ['fsn1'] }
    )
})

beforeEach(() => {
    vi.clearAllMocks()
    h.insertCalls.length = 0
    h.mockGetProvider.mockReset()
})

describe('createActivationCodeBatch — validityDays validation', () => {
    it('rejects null validityDays', async () => {
        const { status, body } = await callMint({
            skuKind: 'new',
            planId: 'cpx21',
            provider: 'hetzner',
            region: 'fsn1',
            seats: 1
        })
        expect(status).toBe(400)
        expect((body as { message: string }).message).toMatch(
            /validityDays/i
        )
    })

    it('rejects validityDays < 1', async () => {
        const { status } = await callMint({
            skuKind: 'new',
            planId: 'cpx21',
            provider: 'hetzner',
            region: 'fsn1',
            validityDays: 0,
            seats: 1
        })
        expect(status).toBe(400)
    })

    it('rejects validityDays > 999', async () => {
        const { status } = await callMint({
            skuKind: 'new',
            planId: 'cpx21',
            provider: 'hetzner',
            region: 'fsn1',
            validityDays: 1000,
            seats: 1
        })
        expect(status).toBe(400)
    })

    it('accepts validityDays in [1, 999]', async () => {
        h.mockGetProvider.mockReturnValue(validProvider())
        const { status } = await callMint({
            skuKind: 'new',
            planId: 'cpx21',
            provider: 'hetzner',
            region: 'fsn1',
            validityDays: 365,
            seats: 1
        })
        expect(status).toBe(200)
    })
})

describe('createActivationCodeBatch — seats validation', () => {
    it.each([1, 5, 25, 50])('accepts seats=%d', async (seats) => {
        h.mockGetProvider.mockReturnValue(validProvider())
        const { status } = await callMint({
            skuKind: 'new',
            planId: 'cpx21',
            provider: 'hetzner',
            region: 'fsn1',
            validityDays: 90,
            seats
        })
        expect(status).toBe(200)
    })

    it.each([2, 10, 100, 0, -1])('rejects seats=%d', async (seats) => {
        const { status, body } = await callMint({
            skuKind: 'new',
            planId: 'cpx21',
            provider: 'hetzner',
            region: 'fsn1',
            validityDays: 90,
            seats
        })
        expect(status).toBe(400)
        expect((body as { message: string }).message).toMatch(/seats/i)
    })
})

describe('createActivationCodeBatch — new SKU plan/provider/region required', () => {
    it('rejects new without planId', async () => {
        const { status, body } = await callMint({
            skuKind: 'new',
            provider: 'hetzner',
            region: 'fsn1',
            validityDays: 90,
            seats: 1
        })
        expect(status).toBe(400)
        expect((body as { message: string }).message).toMatch(/planId/i)
    })

    it('rejects new without provider', async () => {
        const { status, body } = await callMint({
            skuKind: 'new',
            planId: 'cpx21',
            region: 'fsn1',
            validityDays: 90,
            seats: 1
        })
        expect(status).toBe(400)
        expect((body as { message: string }).message).toMatch(/provider/i)
    })

    it('rejects new without region', async () => {
        const { status, body } = await callMint({
            skuKind: 'new',
            planId: 'cpx21',
            provider: 'hetzner',
            validityDays: 90,
            seats: 1
        })
        expect(status).toBe(400)
        expect((body as { message: string }).message).toMatch(/region/i)
    })

    it('rejects when provider is not registered', async () => {
        h.mockGetProvider.mockReturnValue(null)
        const { status, body } = await callMint({
            skuKind: 'new',
            planId: 'cpx21',
            provider: 'unknown',
            region: 'fsn1',
            validityDays: 90,
            seats: 1
        })
        expect(status).toBe(400)
        expect((body as { message: string }).message).toMatch(
            /Provider is not available/i
        )
    })

    it('rejects when region is unknown to provider', async () => {
        h.mockGetProvider.mockReturnValue(validProvider())
        const { status, body } = await callMint({
            skuKind: 'new',
            planId: 'cpx21',
            provider: 'hetzner',
            region: 'unknown',
            validityDays: 90,
            seats: 1
        })
        expect(status).toBe(400)
        expect((body as { message: string }).message).toMatch(/Region/i)
    })

    it('rejects when plan is unavailable at region', async () => {
        h.mockGetProvider.mockReturnValue(
            validProvider({ availability: { cpx21: ['nbg1'] } })
        )
        const { status, body } = await callMint({
            skuKind: 'new',
            planId: 'cpx21',
            provider: 'hetzner',
            region: 'fsn1',
            validityDays: 90,
            seats: 1
        })
        expect(status).toBe(400)
        expect((body as { message: string }).message).toMatch(/Plan/i)
    })
})

describe('createActivationCodeBatch — renewal SKU is plan-agnostic', () => {
    it('accepts renewal with no planId/provider/region', async () => {
        const { status } = await callMint({
            skuKind: 'renewal',
            validityDays: 30,
            seats: 1
        })
        expect(status).toBe(200)
        // No provider lookup — renewal does not validate location.
        expect(h.mockGetProvider).not.toHaveBeenCalled()
    })

    it('renewal codes are still subject to validityDays + seats validation', async () => {
        const { status } = await callMint({
            skuKind: 'renewal',
            validityDays: 0,
            seats: 1
        })
        expect(status).toBe(400)
    })
})

describe('createActivationCodeBatch — expiresAt parsing', () => {
    it('rejects malformed expiresAt', async () => {
        h.mockGetProvider.mockReturnValue(validProvider())
        const { status, body } = await callMint({
            skuKind: 'new',
            planId: 'cpx21',
            provider: 'hetzner',
            region: 'fsn1',
            validityDays: 90,
            seats: 1,
            expiresAt: 'not-a-real-date'
        })
        expect(status).toBe(400)
        expect((body as { message: string }).message).toMatch(/expiresAt/i)
    })

    it('accepts ISO 8601 expiresAt', async () => {
        h.mockGetProvider.mockReturnValue(validProvider())
        const { status } = await callMint({
            skuKind: 'new',
            planId: 'cpx21',
            provider: 'hetzner',
            region: 'fsn1',
            validityDays: 90,
            seats: 1,
            expiresAt: '2027-01-01T00:00:00Z'
        })
        expect(status).toBe(200)
    })
})

describe('createActivationCodeBatch — code format & batch shape', () => {
    it('generates codes matching the white-paper xxxxxxxxx-DDD-UUU format', async () => {
        h.mockGetProvider.mockReturnValue(validProvider())
        const { body } = await callMint({
            skuKind: 'new',
            planId: 'cpx21',
            provider: 'hetzner',
            region: 'fsn1',
            validityDays: 90,
            seats: 5,
            count: 3
        })
        const codes = (
            body as { data: { codes: Array<{ code: string }> } }
        ).data.codes
        expect(codes).toHaveLength(3)
        for (const { code } of codes) {
            // 9 chars + dash + 3 digits + dash + 3 digits.
            expect(code).toMatch(
                /^[2-9A-HJ-NP-Z]{9}-[0-9]{3}-[0-9]{3}$/
            )
            // ddd encodes validityDays; uuu encodes seats.
            const [, ddd, uuu] = code.split('-')
            expect(ddd).toBe('090')
            expect(uuu).toBe('005')
        }
    })

    it('mints `count` rows up to MAX_BATCH_SIZE; clamps overflow', async () => {
        h.mockGetProvider.mockReturnValue(validProvider())
        const { body } = await callMint({
            skuKind: 'new',
            planId: 'cpx21',
            provider: 'hetzner',
            region: 'fsn1',
            validityDays: 90,
            seats: 1,
            count: 999_999
        })
        const codes = (
            body as { data: { codes: Array<unknown> } }
        ).data.codes
        // Spec says clamp to MAX_BATCH_SIZE=1000.
        expect(codes.length).toBe(1000)
    })

    it('count defaults to 1', async () => {
        h.mockGetProvider.mockReturnValue(validProvider())
        const { body } = await callMint({
            skuKind: 'new',
            planId: 'cpx21',
            provider: 'hetzner',
            region: 'fsn1',
            validityDays: 90,
            seats: 1
        })
        expect(
            (body as { data: { count: number } }).data.count
        ).toBe(1)
    })

    it('all rows in a batch share the same batchId', async () => {
        h.mockGetProvider.mockReturnValue(validProvider())
        await callMint({
            skuKind: 'new',
            planId: 'cpx21',
            provider: 'hetzner',
            region: 'fsn1',
            validityDays: 90,
            seats: 1,
            count: 4
        })
        const rows = h.insertCalls[0]?.[0] as Array<{ batchId: string }>
        const batchIds = new Set(rows.map((r) => r.batchId))
        expect(batchIds.size).toBe(1)
    })

    it('two separate calls produce different batchIds', async () => {
        h.mockGetProvider.mockReturnValue(validProvider())
        const args = {
            skuKind: 'new' as const,
            planId: 'cpx21',
            provider: 'hetzner',
            region: 'fsn1',
            validityDays: 90,
            seats: 1
        }
        await callMint(args)
        await callMint(args)
        const a = (h.insertCalls[0]?.[0] as Array<{ batchId: string }>)[0]
            .batchId
        const b = (h.insertCalls[1]?.[0] as Array<{ batchId: string }>)[0]
            .batchId
        expect(a).not.toBe(b)
    })

    it('skuKind defaults to "new" when missing', async () => {
        h.mockGetProvider.mockReturnValue(validProvider())
        await callMint({
            planId: 'cpx21',
            provider: 'hetzner',
            region: 'fsn1',
            validityDays: 90,
            seats: 1
        })
        const rows = h.insertCalls[0]?.[0] as Array<{ skuKind: string }>
        expect(rows[0].skuKind).toBe('new')
    })

    it('trims partnerName / tierLabel / notes to null when empty', async () => {
        h.mockGetProvider.mockReturnValue(validProvider())
        await callMint({
            skuKind: 'new',
            planId: 'cpx21',
            provider: 'hetzner',
            region: 'fsn1',
            validityDays: 90,
            seats: 1,
            partnerName: '   ',
            tierLabel: '',
            notes: '\t\n'
        })
        const row = (
            h.insertCalls[0]?.[0] as Array<{
                partnerName: string | null
                tierLabel: string | null
                notes: string | null
            }>
        )[0]
        expect(row.partnerName).toBeNull()
        expect(row.tierLabel).toBeNull()
        expect(row.notes).toBeNull()
    })

    it('records createdByUserId from the context', async () => {
        h.mockGetProvider.mockReturnValue(validProvider())
        await callMint(
            {
                skuKind: 'new',
                planId: 'cpx21',
                provider: 'hetzner',
                region: 'fsn1',
                validityDays: 90,
                seats: 1
            },
            'super-admin-7'
        )
        const row = (
            h.insertCalls[0]?.[0] as Array<{ createdByUserId: string }>
        )[0]
        expect(row.createdByUserId).toBe('super-admin-7')
    })
})