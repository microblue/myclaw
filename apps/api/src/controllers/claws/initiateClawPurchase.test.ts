import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => {
    // Chainable thenable: every property access returns a function that
    // returns the proxy itself, except `.then` which resolves to `result`.
    // Lets drizzle-style `db.select().from().where().limit()` chains await
    // to a preset value without modeling each terminal method.
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
        mockDbDelete: vi.fn(() => makeChain(undefined)),
        mockDbSelect: vi.fn(() => makeChain(selectQueue.shift())),
        mockDbInsert: vi.fn(() => makeChain(undefined)),
        mockDbUpdate: vi.fn(() => makeChain(undefined)),
        mockCheckoutsCreate: vi.fn(),
        mockCustomersGetOrCreate: vi.fn(),
        mockProvisionClaw: vi.fn(),
        mockGetAvailableProviders: vi.fn(() => [{ id: 'hetzner' }]),
        mockGetProvider: vi.fn()
    }
})

const {
    makeChain,
    selectQueue,
    mockDbDelete,
    mockDbSelect,
    mockDbInsert,
    mockDbUpdate,
    mockCheckoutsCreate,
    mockCustomersGetOrCreate,
    mockProvisionClaw,
    mockGetAvailableProviders,
    mockGetProvider
} = h

vi.mock('@/db', () => ({
    db: {
        delete: (...args: unknown[]) => h.mockDbDelete(...args),
        select: (...args: unknown[]) => h.mockDbSelect(...args),
        insert: (...args: unknown[]) => h.mockDbInsert(...args),
        update: (...args: unknown[]) => h.mockDbUpdate(...args)
    }
}))

vi.mock('@/db/schema', () => ({
    users: { id: 'users.id' },
    sshKeys: { id: 'sshKeys.id', userId: 'sshKeys.userId' },
    claws: { userId: 'claws.userId' },
    pendingClaws: { expiresAt: 'pendingClaws.expiresAt' }
}))

vi.mock('@/lib/polar', () => ({
    checkouts: { create: h.mockCheckoutsCreate },
    customers: { getOrCreate: h.mockCustomersGetOrCreate }
}))

vi.mock('@/controllers/claws/provisionClaw', () => ({
    default: h.mockProvisionClaw
}))

vi.mock('@/services/providers', () => ({
    providerRegistry: {
        getAvailableProviders: h.mockGetAvailableProviders,
        getProvider: h.mockGetProvider
    }
}))

vi.mock('@/services/provider', () => ({
    getProvider: vi.fn()
}))

vi.mock('@/lib/environment', () => ({
    getEnvironment: vi.fn(() => 'test')
}))

vi.mock('@/controllers/claws/helpers', () => ({
    generatePassword: vi.fn(() => 'generated-pw')
}))

vi.mock('@openclaw/i18n', () => ({
    t: (key: string) => key
}))

import initiateClawPurchase from './initiateClawPurchase'

type BodyOverrides = Record<string, unknown>

const buildContext = (body: BodyOverrides = {}, headers: Record<string, string> = {}) => {
    const defaultBody = {
        name: 'test-claw',
        planId: 'cx23',
        location: 'fsn1',
        priceMonthly: 5.99,
        billingInterval: 'month'
    }
    const mergedBody = { ...defaultBody, ...body }
    const status = { code: 0 }
    const payload = { captured: null as unknown }
    const ctx = {
        get: vi.fn((key: string) => (key === 'userId' ? 'user-1' : undefined)),
        req: {
            json: vi.fn(async () => mergedBody),
            header: vi.fn((k: string) => headers[k])
        },
        json: vi.fn((data: unknown, code = 200) => {
            status.code = code
            payload.captured = data
            return { _status: code, _body: data }
        })
    }
    return { ctx, status, payload }
}

const readResponse = async (
    promise: Promise<unknown>
): Promise<{ status: number; body: Record<string, unknown> }> => {
    const res = (await promise) as { _status: number; _body: Record<string, unknown> }
    return { status: res._status, body: res._body }
}

describe('initiateClawPurchase', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        selectQueue.length = 0
        mockDbDelete.mockImplementation(() => makeChain(undefined))
        mockDbSelect.mockImplementation(() => makeChain(selectQueue.shift()))
        mockDbInsert.mockImplementation(() => makeChain(undefined))
        mockDbUpdate.mockImplementation(() => makeChain(undefined))
        mockGetAvailableProviders.mockReturnValue([{ id: 'hetzner' }])
        // Clear every POLAR_PRODUCT_* env var so tests default to dev mode.
        for (const key of Object.keys(process.env)) {
            if (key.startsWith('POLAR_PRODUCT_')) delete process.env[key]
        }
    })

    it('returns 400 when planId is missing', async () => {
        const { ctx } = buildContext({ planId: undefined })
        // @ts-expect-error stubbed context
        const { status, body } = await readResponse(initiateClawPurchase(ctx))
        expect(status).toBe(400)
        expect(body.message).toBe('api.missingRequiredFields')
    })

    it('returns 400 when location is missing', async () => {
        const { ctx } = buildContext({ location: undefined })
        // @ts-expect-error stubbed context
        const { status, body } = await readResponse(initiateClawPurchase(ctx))
        expect(status).toBe(400)
        expect(body.message).toBe('api.missingRequiredFields')
    })

    it('returns 400 when priceMonthly is missing', async () => {
        const { ctx } = buildContext({ priceMonthly: undefined })
        // @ts-expect-error stubbed context
        const { status, body } = await readResponse(initiateClawPurchase(ctx))
        expect(status).toBe(400)
    })

    it('dev mode provisions directly when no Polar product is configured', async () => {
        mockProvisionClaw.mockResolvedValue({ success: true, clawId: 'claw-xyz' })
        const { ctx } = buildContext()
        // @ts-expect-error stubbed context
        const { status, body } = await readResponse(initiateClawPurchase(ctx))

        expect(status).toBe(200)
        expect(body.data).toMatchObject({
            devMode: true,
            pendingClawId: 'claw-xyz'
        })
        expect(mockProvisionClaw).toHaveBeenCalledTimes(1)
        expect(mockDbInsert).toHaveBeenCalledTimes(1)
        expect(mockCheckoutsCreate).not.toHaveBeenCalled()
    })

    it('dev mode returns 500 when provisionClaw fails', async () => {
        mockProvisionClaw.mockResolvedValue({ success: false, error: 'boom' })
        const { ctx } = buildContext()
        // @ts-expect-error stubbed context
        const { status, body } = await readResponse(initiateClawPurchase(ctx))
        expect(status).toBe(500)
        expect(body.message).toBe('boom')
    })

    describe('production mode', () => {
        const plans = [
            { name: 'cx23', memory: 8, description: 'test', cpu: 2, disk: 40 }
        ]
        const locations = [
            { id: 'fsn1', name: 'Falkenstein', city: 'FSN', country: 'DE', region: 'eu-central', continent: 'EU', disabled: false }
        ]

        beforeEach(() => {
            process.env.POLAR_PRODUCT_CX23_MONTHLY = 'prod_cx23'
            mockGetProvider.mockReturnValue({
                getPlans: vi.fn(async () => plans),
                getLocations: vi.fn(async () => locations),
                getPlanAvailability: vi.fn(async () => ({ cx23: ['fsn1'] }))
            })
        })

        it('returns 400 when provider is not available', async () => {
            mockGetProvider.mockReturnValue(null)
            const { ctx } = buildContext()
            // @ts-expect-error stubbed context
            const { status, body } = await readResponse(initiateClawPurchase(ctx))
            expect(status).toBe(400)
            expect(body.message).toBe('api.providerNotAvailable')
        })

        it('returns 400 when planId is in PLAN_TO_POLAR but not offered by provider', async () => {
            // cx33 is in PLAN_TO_POLAR but not in our mock getPlans().
            process.env.POLAR_PRODUCT_CX33_MONTHLY = 'prod_cx33'
            const { ctx } = buildContext({ planId: 'cx33' })
            // @ts-expect-error stubbed context
            const { status, body } = await readResponse(initiateClawPurchase(ctx))
            expect(status).toBe(400)
            expect(body.message).toBe('api.invalidPlan')
        })

        it('returns 400 when the location does not exist', async () => {
            const { ctx } = buildContext({ location: 'atlantis' })
            // @ts-expect-error stubbed context
            const { status, body } = await readResponse(initiateClawPurchase(ctx))
            expect(status).toBe(400)
            expect(body.message).toBe('api.invalidLocation')
        })

        it('returns 400 when claw count exceeds account limit', async () => {
            // Queue select results in the order the controller awaits them:
            // 1) claw count, 2) user lookup, 3) ssh key lookup (only if sshKeyId given)
            selectQueue.push([{ value: 50 }])
            selectQueue.push([{ id: 'user-1', email: 'u@e', polarCustomerId: 'cus_1' }])
            const { ctx } = buildContext()
            // @ts-expect-error stubbed context
            const { status, body } = await readResponse(initiateClawPurchase(ctx))
            expect(status).toBe(400)
            expect(body.message).toBe('api.clawLimitReached')
        })

        it('creates a Polar checkout and pending claw on the happy path', async () => {
            selectQueue.push([{ value: 0 }])
            selectQueue.push([
                {
                    id: 'user-1',
                    email: 'u@e',
                    name: 'U',
                    polarCustomerId: 'cus_1'
                }
            ])
            mockCheckoutsCreate.mockResolvedValue({
                id: 'ck_1',
                url: 'https://checkout/ck_1'
            })

            const { ctx } = buildContext()
            // @ts-expect-error stubbed context
            const { status, body } = await readResponse(initiateClawPurchase(ctx))

            expect(status).toBe(200)
            expect(body.data).toMatchObject({
                checkoutUrl: 'https://checkout/ck_1',
                checkoutId: 'ck_1'
            })
            expect(mockCheckoutsCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    productId: 'prod_cx23',
                    customerEmail: 'u@e',
                    customerId: 'cus_1'
                })
            )
            expect(mockDbInsert).toHaveBeenCalledTimes(1)
            expect(mockCustomersGetOrCreate).not.toHaveBeenCalled()
        })

        it('calls customers.getOrCreate when user has no polarCustomerId', async () => {
            selectQueue.push([{ value: 0 }])
            selectQueue.push([
                {
                    id: 'user-1',
                    email: 'u@e',
                    name: 'U',
                    polarCustomerId: null
                }
            ])
            mockCustomersGetOrCreate.mockResolvedValue({ id: 'cus_new' })
            mockCheckoutsCreate.mockResolvedValue({
                id: 'ck_2',
                url: 'https://checkout/ck_2'
            })

            const { ctx } = buildContext()
            // @ts-expect-error stubbed context
            await readResponse(initiateClawPurchase(ctx))

            expect(mockCustomersGetOrCreate).toHaveBeenCalledWith({
                email: 'u@e',
                name: 'U',
                externalId: 'user-1'
            })
            expect(mockDbUpdate).toHaveBeenCalled()
            expect(mockCheckoutsCreate).toHaveBeenCalledWith(
                expect.objectContaining({ customerId: 'cus_new' })
            )
        })
    })
})
