import { describe, it, expect, beforeEach, vi } from 'vitest'

// Drizzle chain mock — same pattern as provisionClaw.test.ts. Each db
// op pulls its next result from a typed FIFO queue. Empty queue means
// the call is unexpected (we want loud failures, not silent []s) for
// most paths, but a few defensive defaults keep the proxy navigable.
const h = vi.hoisted(() => {
    const makeChain = (result: unknown) => {
        const target = {}
        const proxy: unknown = new Proxy(target, {
            get(_t, prop) {
                if (prop === 'then') {
                    return (
                        onFulfilled: (v: unknown) => unknown,
                        onRejected?: (e: unknown) => unknown
                    ) =>
                        Promise.resolve(result).then(onFulfilled, onRejected)
                }
                return () => proxy
            }
        })
        return proxy
    }
    const queues = {
        select: [] as unknown[],
        update: [] as unknown[],
        insert: [] as unknown[]
    }
    const nextOr = (queue: unknown[], fallback: unknown) =>
        queue.length ? queue.shift() : fallback
    return {
        makeChain,
        queues,
        mockDbSelect: vi.fn(() => makeChain(nextOr(queues.select, []))),
        mockDbUpdate: vi.fn(() => makeChain(nextOr(queues.update, []))),
        mockDbInsert: vi.fn(() => makeChain(nextOr(queues.insert, undefined))),
        mockGetProvider: vi.fn(),
        mockProvisionClawServer: vi.fn(() => Promise.resolve())
    }
})

const {
    queues,
    mockDbSelect,
    mockDbUpdate,
    mockDbInsert,
    mockGetProvider,
    mockProvisionClawServer
} = h

vi.mock('@/db', () => {
    const db = {
        select: (...args: unknown[]) => h.mockDbSelect(...args),
        update: (...args: unknown[]) => h.mockDbUpdate(...args),
        insert: (...args: unknown[]) => h.mockDbInsert(...args),
        // transaction(fn) runs fn against a tx that proxies to the same
        // mocked methods, so per-tx queues feed exactly the same way.
        transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
            fn({
                insert: (...args: unknown[]) => h.mockDbInsert(...args),
                update: (...args: unknown[]) => h.mockDbUpdate(...args),
                select: (...args: unknown[]) => h.mockDbSelect(...args)
            })
        )
    }
    return { db }
})

vi.mock('@/db/schema', () => ({
    claws: {
        id: 'claws.id',
        userId: 'claws.userId'
    },
    sshKeys: { id: 'sshKeys.id', userId: 'sshKeys.userId' },
    activationCodes: {
        id: 'activationCodes.id',
        code: 'activationCodes.code',
        seatsUsed: 'activationCodes.seatsUsed',
        seats: 'activationCodes.seats',
        status: 'activationCodes.status'
    },
    activationSeats: { id: 'activationSeats.id' }
}))

vi.mock('@/services/providers', () => ({
    providerRegistry: { getProvider: h.mockGetProvider }
}))

vi.mock('@/controllers/claws/helpers', () => ({
    generatePassword: vi.fn(() => 'generated-password'),
    generateClawName: vi.fn(() => 'generated-claw-name'),
    generateSlug: vi.fn(() => 'happy-panda'),
    generateToken: vi.fn(() => 'gw-token-xyz'),
    provisionClawServer: vi.fn((...args: unknown[]) =>
        h.mockProvisionClawServer(...args)
    )
}))

vi.mock('@openclaw/i18n', () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
        vars ? `${key}:${JSON.stringify(vars)}` : key
}))

vi.mock('@openclaw/shared', async () => {
    const actual =
        await vi.importActual<typeof import('@openclaw/shared')>(
            '@openclaw/shared'
        )
    return {
        ...actual,
        inputValidation: {
            ...actual.inputValidation,
            CLAWS_PER_ACCOUNT: { MIN: 0, MAX: 5 }
        },
        clawStatus: { ...actual.clawStatus, creating: 'creating' },
        billingInterval: { ...actual.billingInterval, MONTH: 'month' }
    }
})

import redeemActivationCode from './redeemActivationCode'

interface FakeJsonCall {
    body: unknown
    status: number
}

const makeContext = () => {
    const calls: FakeJsonCall[] = []
    const c = {
        json: vi.fn((body: unknown, status: number = 200) => {
            calls.push({ body, status })
            return { body, status } as unknown as Response
        })
    }
    return { c: c as unknown as Parameters<typeof redeemActivationCode>[0]['c'], calls }
}

const baseCodeRow = {
    id: 'code-1',
    code: 'ABCDEFGHJ-090-005',
    planId: 'cpx21',
    provider: 'hetzner',
    region: 'fsn1',
    skuKind: 'new' as 'new' | 'renewal',
    seats: 5,
    seatsUsed: 0,
    validityDays: 90,
    status: 'unused',
    expiresAt: null as Date | null,
    tierLabel: null,
    partnerName: null,
    batchId: null,
    notes: null,
    redeemedByUserId: null,
    redeemedClawId: null,
    redeemedAt: null,
    createdAt: new Date(),
    createdByUserId: null
}

const baseClaw = {
    id: 'claw-existing',
    userId: 'user-1',
    name: 'old-claw',
    planId: 'cpx21',
    provider: 'hetzner',
    location: 'fsn1',
    deletionScheduledAt: null as Date | null,
    status: 'running'
}

const stubProvider = (
    overrides: {
        locations?: Array<{ id: string; disabled: boolean }>
        planAvailability?: Record<string, string[]>
    } = {}
) => ({
    getLocations: vi.fn(async () =>
        overrides.locations ?? [
            { id: 'fsn1', name: 'Falkenstein', country: 'DE', disabled: false }
        ]
    ),
    getPlanAvailability: vi.fn(async () =>
        overrides.planAvailability ?? { cpx21: ['fsn1'] }
    )
})

const callRedeem = async (
    overrides: Partial<Parameters<typeof redeemActivationCode>[0]> = {}
) => {
    const { c, calls } = makeContext()
    await redeemActivationCode({
        c,
        userId: 'user-1',
        code: 'ABCDEFGHJ-090-005',
        clawType: 'openclaw',
        ...overrides
    })
    return { calls, body: calls[0]?.body, status: calls[0]?.status }
}

beforeEach(() => {
    vi.clearAllMocks()
    queues.select.length = 0
    queues.update.length = 0
    queues.insert.length = 0
    mockGetProvider.mockReset()
})

describe('redeemActivationCode — common rejection paths', () => {
    it('rejects empty code with 400', async () => {
        const { status, body } = await callRedeem({ code: '   ' })
        expect(status).toBe(400)
        expect((body as { success: boolean }).success).toBe(false)
    })

    it('returns 400 when code is not in DB', async () => {
        queues.select.push([])
        const { status, body } = await callRedeem()
        expect(status).toBe(400)
        expect((body as { message: string }).message).toMatch(/not found/i)
    })

    it('rejects when code is voided', async () => {
        queues.select.push([{ ...baseCodeRow, status: 'voided' }])
        const { status, body } = await callRedeem()
        expect(status).toBe(400)
        expect((body as { message: string }).message).toMatch(/voided/i)
    })

    it('rejects when seatsUsed already equals seats (no seats left)', async () => {
        queues.select.push([{ ...baseCodeRow, seatsUsed: 5, seats: 5 }])
        const { status, body } = await callRedeem()
        expect(status).toBe(400)
        expect((body as { message: string }).message).toMatch(/no seats left/i)
    })

    it('rejects when status is already redeemed (multi-seat sentinel)', async () => {
        queues.select.push([
            { ...baseCodeRow, status: 'redeemed', seatsUsed: 5, seats: 5 }
        ])
        const { status } = await callRedeem()
        expect(status).toBe(400)
    })

    it('rejects when code has expired', async () => {
        queues.select.push([
            { ...baseCodeRow, expiresAt: new Date(Date.now() - 1000) }
        ])
        const { status, body } = await callRedeem()
        expect(status).toBe(400)
        expect((body as { message: string }).message).toMatch(/expired/i)
    })
})

describe('redeemActivationCode — concurrent CAS seat claim', () => {
    it('returns 400 when claimSeat update affects 0 rows (lost the race)', async () => {
        queues.select.push([{ ...baseCodeRow }])
        mockGetProvider.mockReturnValue(stubProvider())
        queues.select.push([{ value: 0 }])
        // claimSeat → returning() yields [] (race lost).
        queues.update.push([])
        const { status, body } = await callRedeem()
        expect(status).toBe(400)
        expect((body as { message: string }).message).toMatch(/no seats left/i)
        // critical: no insert into claws or activationSeats
        expect(mockDbInsert).not.toHaveBeenCalled()
    })

    it('proceeds when claimSeat returns a row (race won)', async () => {
        queues.select.push([{ ...baseCodeRow }])
        mockGetProvider.mockReturnValue(stubProvider())
        queues.select.push([{ value: 0 }])
        // claimSeat won.
        queues.update.push([{ id: 'code-1' }])
        const { status, body } = await callRedeem()
        expect(status).toBe(200)
        expect((body as { success: boolean }).success).toBe(true)
        expect(mockProvisionClawServer).toHaveBeenCalledWith({
            clawId: expect.any(String),
            volumeSize: null
        })
    })
})

describe('redeemActivationCode — new SKU validation', () => {
    it('rejects when codeRow is missing planId/provider/region', async () => {
        queues.select.push([
            { ...baseCodeRow, planId: null, provider: null, region: null }
        ])
        const { status } = await callRedeem()
        expect(status).toBe(400)
    })

    it('rejects when provider is not registered', async () => {
        queues.select.push([{ ...baseCodeRow }])
        mockGetProvider.mockReturnValue(null)
        const { status, body } = await callRedeem()
        expect(status).toBe(400)
        expect((body as { message: string }).message).toMatch(
            /providerNotAvailable/i
        )
    })

    it('rejects when region is unknown to provider', async () => {
        queues.select.push([{ ...baseCodeRow, region: 'unknown' }])
        mockGetProvider.mockReturnValue(stubProvider())
        const { status, body } = await callRedeem()
        expect(status).toBe(400)
        expect((body as { message: string }).message).toMatch(/invalidLocation/i)
    })

    it('rejects when plan is not available at the chosen region', async () => {
        queues.select.push([{ ...baseCodeRow }])
        mockGetProvider.mockReturnValue(
            stubProvider({ planAvailability: { cpx21: ['nbg1'] } })
        )
        const { status, body } = await callRedeem()
        expect(status).toBe(400)
        expect((body as { message: string }).message).toMatch(
            /planNotAvailableAtLocation/i
        )
    })

    it('rejects when user is at claw cap', async () => {
        queues.select.push([{ ...baseCodeRow }])
        mockGetProvider.mockReturnValue(stubProvider())
        queues.select.push([{ value: 5 }])
        const { status, body } = await callRedeem()
        expect(status).toBe(400)
        expect((body as { message: string }).message).toMatch(
            /clawLimitReached/i
        )
    })

    it('rejects when sshKeyId is provided but key not on user account', async () => {
        queues.select.push([{ ...baseCodeRow }])
        mockGetProvider.mockReturnValue(stubProvider())
        queues.select.push([{ value: 0 }])
        queues.select.push([])
        const { status, body } = await callRedeem({ sshKeyId: 'ssh-missing' })
        expect(status).toBe(404)
        expect((body as { message: string }).message).toMatch(
            /sshKeyNotFound/i
        )
    })

    it('happy path: claimSeat won → claws insert + provisionClawServer fired', async () => {
        queues.select.push([{ ...baseCodeRow, validityDays: 90 }])
        mockGetProvider.mockReturnValue(stubProvider())
        queues.select.push([{ value: 0 }])
        queues.update.push([{ id: 'code-1' }])
        const { status } = await callRedeem()
        expect(status).toBe(200)
        // 1 insert for claws + 1 insert for activationSeats inside transaction.
        expect(mockDbInsert.mock.calls.length).toBeGreaterThanOrEqual(2)
        expect(mockProvisionClawServer).toHaveBeenCalledOnce()
    })

    it('null validityDays produces null deletionScheduledAt (perpetual)', async () => {
        queues.select.push([{ ...baseCodeRow, validityDays: null }])
        mockGetProvider.mockReturnValue(stubProvider())
        queues.select.push([{ value: 0 }])
        queues.update.push([{ id: 'code-1' }])
        const { status } = await callRedeem()
        expect(status).toBe(200)
        expect(mockProvisionClawServer).toHaveBeenCalledOnce()
    })
})

describe('redeemActivationCode — renewal SKU', () => {
    const renewalRow = { ...baseCodeRow, skuKind: 'renewal' as const }

    it('rejects renewal without extendsClawId', async () => {
        queues.select.push([renewalRow])
        const { status, body } = await callRedeem({ extendsClawId: undefined })
        expect(status).toBe(400)
        expect((body as { message: string }).message).toMatch(/Pick a claw/i)
    })

    it('rejects renewal with null validityDays (perpetual renewals not supported)', async () => {
        queues.select.push([{ ...renewalRow, validityDays: null }])
        const { status, body } = await callRedeem({
            extendsClawId: 'claw-existing'
        })
        expect(status).toBe(400)
        expect((body as { message: string }).message).toMatch(/perpetual/i)
    })

    it('rejects renewal when target claw not on user', async () => {
        queues.select.push([renewalRow])
        queues.select.push([])
        const { status, body } = await callRedeem({
            extendsClawId: 'someone-elses-claw'
        })
        expect(status).toBe(404)
        expect((body as { message: string }).message).toMatch(
            /couldn't find that claw/i
        )
    })

    it('rejects renewal with plan mismatch', async () => {
        queues.select.push([{ ...renewalRow, planId: 'cpx51' }])
        queues.select.push([{ ...baseClaw, planId: 'cpx21' }])
        const { status, body } = await callRedeem({
            extendsClawId: 'claw-existing'
        })
        expect(status).toBe(400)
        expect((body as { message: string }).message).toMatch(
            /different plan/i
        )
    })

    it('rejects renewal with provider mismatch', async () => {
        queues.select.push([{ ...renewalRow, provider: 'lightsail' }])
        queues.select.push([{ ...baseClaw, provider: 'hetzner' }])
        const { status, body } = await callRedeem({
            extendsClawId: 'claw-existing'
        })
        expect(status).toBe(400)
        expect((body as { message: string }).message).toMatch(
            /different provider/i
        )
    })

    it('anchors expiry on max(deletionScheduledAt, now) + validityDays when claw is still active', async () => {
        const now = Date.now()
        const future = new Date(now + 30 * 24 * 60 * 60 * 1000)
        queues.select.push([{ ...renewalRow, validityDays: 90 }])
        queues.select.push([{ ...baseClaw, deletionScheduledAt: future }])
        queues.update.push([{ id: 'code-1' }])

        const { status, body } = await callRedeem({
            extendsClawId: 'claw-existing'
        })
        expect(status).toBe(200)
        const extendedTo = new Date(
            (body as { data: { extendedTo: string } }).data.extendedTo
        ).getTime()
        // Expected ≈ now + 120 days; allow ±2-day slack for setUTCDate quirks.
        const expected = now + 120 * 24 * 60 * 60 * 1000
        expect(Math.abs(extendedTo - expected)).toBeLessThan(
            2 * 24 * 60 * 60 * 1000
        )
    })

    it('anchors expiry on now when claw is already expired (no negative carry-over)', async () => {
        const now = Date.now()
        const past = new Date(now - 10 * 24 * 60 * 60 * 1000)
        queues.select.push([{ ...renewalRow, validityDays: 30 }])
        queues.select.push([{ ...baseClaw, deletionScheduledAt: past }])
        queues.update.push([{ id: 'code-1' }])

        const { status, body } = await callRedeem({
            extendsClawId: 'claw-existing'
        })
        expect(status).toBe(200)
        const extendedTo = new Date(
            (body as { data: { extendedTo: string } }).data.extendedTo
        ).getTime()
        const expected = now + 30 * 24 * 60 * 60 * 1000
        expect(Math.abs(extendedTo - expected)).toBeLessThan(
            2 * 24 * 60 * 60 * 1000
        )
    })

    it('renewal happy path returns devMode + extendedTo + renewedClawId', async () => {
        queues.select.push([renewalRow])
        queues.select.push([
            { ...baseClaw, deletionScheduledAt: new Date(Date.now() + 1000) }
        ])
        queues.update.push([{ id: 'code-1' }])
        const { status, body } = await callRedeem({
            extendsClawId: 'claw-existing'
        })
        expect(status).toBe(200)
        const data = (body as { data: Record<string, unknown> }).data
        expect(data.activationCode).toBe(true)
        expect(data.devMode).toBe(true)
        expect(data.renewedClawId).toBe('claw-existing')
    })
})