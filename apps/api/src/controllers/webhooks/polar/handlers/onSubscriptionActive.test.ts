import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => {
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
    const selectQueue: unknown[] = []
    return {
        makeChain,
        selectQueue,
        mockDbSelect: vi.fn(() => makeChain(selectQueue.shift() ?? [])),
        mockProvisionClaw: vi.fn(),
        mockTrackReferral: vi.fn(),
        mockGetEnvironment: vi.fn(() => 'production')
    }
})

const {
    selectQueue,
    mockDbSelect,
    mockProvisionClaw,
    mockTrackReferral,
    mockGetEnvironment
} = h

vi.mock('@/db', () => ({
    db: { select: (...args: unknown[]) => h.mockDbSelect(...args) }
}))

vi.mock('@/db/schema', () => ({
    claws: { id: 'claws.id', polarSubscriptionId: 'claws.polarSubscriptionId' }
}))

vi.mock('@/lib/environment', () => ({
    getEnvironment: h.mockGetEnvironment,
    PROD: 'production'
}))

vi.mock('@/controllers/claws', () => ({
    provisionClaw: h.mockProvisionClaw
}))

vi.mock('@/controllers/webhooks/polar/trackReferral', () => ({
    default: h.mockTrackReferral
}))

import onSubscriptionActive from './onSubscriptionActive'

const baseData = {
    id: 'sub_1',
    status: 'active',
    customerId: 'cus_1',
    productId: 'prod_1',
    amount: 599,
    currency: 'USD',
    cancelAtPeriodEnd: false,
    metadata: {
        environment: 'production',
        pendingClawId: 'pending-1',
        userId: 'user-1'
    } as Record<string, string>
}

const ctx = {} as Parameters<typeof onSubscriptionActive>[1]

// Let microtasks settle so fire-and-forget provisionClaw().then() runs.
const flush = () => new Promise((resolve) => setImmediate(resolve))

describe('onSubscriptionActive', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        selectQueue.length = 0
        mockGetEnvironment.mockReturnValue('production')
    })

    it('skips when event environment does not match current environment', async () => {
        mockGetEnvironment.mockReturnValue('staging')
        await onSubscriptionActive(baseData, ctx)
        expect(mockDbSelect).not.toHaveBeenCalled()
        expect(mockProvisionClaw).not.toHaveBeenCalled()
    })

    it('skips when a claw already exists for this subscription', async () => {
        selectQueue.push([{ id: 'claw-existing' }])
        await onSubscriptionActive(baseData, ctx)
        expect(mockProvisionClaw).not.toHaveBeenCalled()
    })

    it('skips when metadata has no pendingClawId', async () => {
        selectQueue.push([])
        const data = { ...baseData, metadata: { environment: 'production' } }
        await onSubscriptionActive(data, ctx)
        expect(mockProvisionClaw).not.toHaveBeenCalled()
    })

    it('treats missing metadata.environment as production', async () => {
        selectQueue.push([])
        mockProvisionClaw.mockResolvedValue({ success: true })
        const data = { ...baseData, metadata: { pendingClawId: 'p1' } }
        await onSubscriptionActive(data, ctx)
        await flush()
        expect(mockProvisionClaw).toHaveBeenCalledTimes(1)
    })

    it('calls provisionClaw with ids lifted from the webhook payload', async () => {
        selectQueue.push([])
        mockProvisionClaw.mockResolvedValue({ success: true })
        await onSubscriptionActive(baseData, ctx)
        await flush()
        expect(mockProvisionClaw).toHaveBeenCalledWith({
            pendingClawId: 'pending-1',
            subscriptionId: 'sub_1',
            customerId: 'cus_1',
            productId: 'prod_1'
        })
    })

    it('tracks a referral when provisionClaw returns a referralCode and userId is in metadata', async () => {
        selectQueue.push([])
        mockProvisionClaw.mockResolvedValue({
            success: true,
            referralCode: 'CODE42'
        })
        await onSubscriptionActive(baseData, ctx)
        await flush()
        expect(mockTrackReferral).toHaveBeenCalledWith(
            'user-1',
            'CODE42',
            'purchase'
        )
    })

    it('does not track a referral when provisionClaw succeeds without a referralCode', async () => {
        selectQueue.push([])
        mockProvisionClaw.mockResolvedValue({ success: true })
        await onSubscriptionActive(baseData, ctx)
        await flush()
        expect(mockTrackReferral).not.toHaveBeenCalled()
    })

    it('does not track a referral when provisionClaw fails', async () => {
        selectQueue.push([])
        mockProvisionClaw.mockResolvedValue({
            success: false,
            referralCode: 'CODE42',
            error: 'boom'
        })
        await onSubscriptionActive(baseData, ctx)
        await flush()
        expect(mockTrackReferral).not.toHaveBeenCalled()
    })

    it('swallows provisionClaw rejections without throwing', async () => {
        selectQueue.push([])
        mockProvisionClaw.mockRejectedValue(new Error('network'))
        await expect(
            onSubscriptionActive(baseData, ctx)
        ).resolves.toBeUndefined()
        await flush()
        expect(mockTrackReferral).not.toHaveBeenCalled()
    })
})
