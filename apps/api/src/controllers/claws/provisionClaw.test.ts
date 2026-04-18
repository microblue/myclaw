import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => {
    // Each DB operation draws its next result from its own FIFO queue.
    // Empty queue → undefined for writes, [] for selects.
    const makeChain = (result: unknown) => {
        const target = {}
        const proxy: unknown = new Proxy(target, {
            get(_t, prop) {
                if (prop === 'then') {
                    return (
                        onFulfilled: (v: unknown) => unknown,
                        onRejected?: (e: unknown) => unknown
                    ) => Promise.resolve(result).then(onFulfilled, onRejected)
                }
                return () => proxy
            }
        })
        return proxy
    }
    const queues = {
        select: [] as unknown[],
        delete: [] as unknown[],
        insert: [] as unknown[],
        update: [] as unknown[]
    }
    const nextOr = (queue: unknown[], fallback: unknown) =>
        queue.length ? queue.shift() : fallback
    return {
        makeChain,
        queues,
        mockDbSelect: vi.fn(() => makeChain(nextOr(queues.select, []))),
        mockDbDelete: vi.fn(() => makeChain(nextOr(queues.delete, undefined))),
        mockDbInsert: vi.fn(() => makeChain(nextOr(queues.insert, undefined))),
        mockDbUpdate: vi.fn(() => makeChain(nextOr(queues.update, undefined))),
        mockGetProvider: vi.fn(),
        mockCreateDNSRecord: vi.fn(() => Promise.resolve())
    }
})

const {
    queues,
    mockDbSelect,
    mockDbDelete,
    mockDbInsert,
    mockDbUpdate,
    mockGetProvider,
    mockCreateDNSRecord
} = h

vi.mock('@/db', () => ({
    db: {
        select: (...args: unknown[]) => h.mockDbSelect(...args),
        delete: (...args: unknown[]) => h.mockDbDelete(...args),
        insert: (...args: unknown[]) => h.mockDbInsert(...args),
        update: (...args: unknown[]) => h.mockDbUpdate(...args)
    }
}))

vi.mock('@/db/schema', () => ({
    claws: { id: 'claws.id', polarSubscriptionId: 'claws.polarSubscriptionId' },
    pendingClaws: { id: 'pendingClaws.id' },
    sshKeys: { id: 'sshKeys.id' },
    volumes: { id: 'volumes.id' }
}))

vi.mock('@/services/providers', () => ({
    providerRegistry: { getProvider: h.mockGetProvider }
}))

vi.mock('@/services/cloudflare', () => ({
    default: { createDNSRecord: h.mockCreateDNSRecord }
}))

vi.mock('@/controllers/claws/helpers', () => ({
    generateSlug: vi.fn(() => 'happy-panda'),
    generateServerName: vi.fn((name: string, id: string) => `${name}-${id.slice(0, 6)}`),
    generateToken: vi.fn(() => 'gate-token-xyz'),
    generateCloudInit: vi.fn(() => '#cloud-config\n'),
    DOMAIN: 'myclaw.test'
}))

vi.mock('@openclaw/i18n', () => ({
    t: (key: string) => key
}))

import provisionClaw from './provisionClaw'

const basePending = {
    id: 'pending-1',
    userId: 'user-1',
    name: 'test-claw',
    planId: 'cx23',
    location: 'fsn1',
    provider: 'hetzner',
    rootPassword: 'pw',
    sshKeyId: null,
    volumeSize: null,
    billingInterval: 'month',
    referralCode: null
}

const baseParams = {
    pendingClawId: 'pending-1',
    subscriptionId: 'sub-1',
    productId: 'prod-1',
    customerId: 'cus-1'
}

const eligiblePlan = {
    id: 'cx23',
    name: 'cx23',
    cpu: 2,
    memory: 8,
    disk: 40
}

const makeProvider = (over: Record<string, unknown> = {}) => ({
    getPlans: vi.fn(async () => [eligiblePlan]),
    createServer: vi.fn(async () => ({ serverId: 'srv-1', ip: '1.2.3.4', status: 'creating' })),
    ...over
})

describe('provisionClaw', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        queues.select.length = 0
        queues.delete.length = 0
        queues.insert.length = 0
        queues.update.length = 0
        mockGetProvider.mockReset()
        mockCreateDNSRecord.mockReset().mockResolvedValue(undefined)
    })

    it('is idempotent: returns existing clawId when subscription already provisioned', async () => {
        queues.select.push([{ id: 'already-1' }])
        const res = await provisionClaw(baseParams)
        expect(res).toEqual({ success: true, clawId: 'already-1' })
        expect(mockDbDelete).not.toHaveBeenCalled()
        expect(mockDbInsert).not.toHaveBeenCalled()
    })

    it('fails when pending claw is not found', async () => {
        queues.select.push([])
        queues.delete.push([]) // returning() yields empty
        const res = await provisionClaw(baseParams)
        expect(res).toEqual({
            success: false,
            error: 'api.pendingClawNotFound'
        })
    })

    it('fails when provider is not available', async () => {
        queues.select.push([])
        queues.delete.push([basePending])
        mockGetProvider.mockReturnValue(null)
        const res = await provisionClaw(baseParams)
        expect(res).toEqual({
            success: false,
            error: 'api.providerNotAvailable'
        })
    })

    it('fails when the pending plan is not offered by the provider', async () => {
        queues.select.push([])
        queues.delete.push([basePending])
        mockGetProvider.mockReturnValue(
            makeProvider({ getPlans: vi.fn(async () => []) })
        )
        const res = await provisionClaw(baseParams)
        expect(res.success).toBe(false)
        expect(res.error).toBe('api.planBelowMinimumMemory')
    })

    it('fails when the plan memory is below the minimum', async () => {
        queues.select.push([])
        queues.delete.push([basePending])
        mockGetProvider.mockReturnValue(
            makeProvider({
                getPlans: vi.fn(async () => [{ ...eligiblePlan, memory: 1 }])
            })
        )
        const res = await provisionClaw(baseParams)
        expect(res.success).toBe(false)
        expect(res.error).toBe('api.planBelowMinimumMemory')
    })

    it('happy path: creates claw row, provisions server, updates DNS, returns success', async () => {
        queues.select.push([]) // existing claw check → none
        queues.delete.push([basePending]) // pending claimed
        const provider = makeProvider()
        mockGetProvider.mockReturnValue(provider)

        const res = await provisionClaw(baseParams)

        expect(res.success).toBe(true)
        expect(typeof res.clawId).toBe('string')
        expect(provider.createServer).toHaveBeenCalledWith(
            expect.objectContaining({
                planId: 'cx23',
                locationId: 'fsn1',
                userData: '#cloud-config\n'
            })
        )
        expect(mockDbInsert).toHaveBeenCalledTimes(1) // claws insert only
        expect(mockDbUpdate).toHaveBeenCalledTimes(1) // server id + configuring
        expect(mockCreateDNSRecord).toHaveBeenCalledWith('happy-panda', '1.2.3.4')
    })

    it('rolls back the claws row when provider.createServer throws', async () => {
        queues.select.push([])
        queues.delete.push([basePending])
        const provider = makeProvider({
            createServer: vi.fn(async () => {
                throw new Error('provider exploded')
            })
        })
        mockGetProvider.mockReturnValue(provider)

        const res = await provisionClaw(baseParams)

        expect(res).toEqual({
            success: false,
            error: 'api.failedToProvisionClaw'
        })
        // db.delete called twice: once for pendingClaws claim, once for rollback
        expect(mockDbDelete).toHaveBeenCalledTimes(2)
    })

    it('creates a volume when volumeSize is set and provider supports it', async () => {
        queues.select.push([])
        queues.delete.push([
            { ...basePending, volumeSize: 50 }
        ])
        const provider = makeProvider({
            createVolume: vi.fn(async () => ({
                id: '9876',
                name: 'test-claw-vol',
                size: 50
            }))
        })
        mockGetProvider.mockReturnValue(provider)

        const res = await provisionClaw(baseParams)

        expect(res.success).toBe(true)
        expect(provider.createVolume).toHaveBeenCalledWith(
            expect.stringContaining('test-claw-vol-'),
            50,
            'fsn1',
            'srv-1'
        )
        expect(mockDbInsert).toHaveBeenCalledTimes(2) // claws + volumes
    })

    it('skips volume creation when provider does not implement createVolume', async () => {
        queues.select.push([])
        queues.delete.push([{ ...basePending, volumeSize: 50 }])
        mockGetProvider.mockReturnValue(makeProvider()) // no createVolume

        const res = await provisionClaw(baseParams)

        expect(res.success).toBe(true)
        expect(mockDbInsert).toHaveBeenCalledTimes(1) // claws only
    })
})