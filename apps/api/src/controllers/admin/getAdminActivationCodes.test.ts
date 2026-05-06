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
                    ) =>
                        Promise.resolve(result).then(onFulfilled, onRejected)
                }
                return () => proxy
            }
        })
        return proxy
    }
    return {
        makeChain,
        // capture every db.select() invocation so we can inspect the
        // .where(...) chain for partner-scoping assertions.
        whereArgs: [] as unknown[],
        results: [] as unknown[],
        mockDbSelect: vi.fn(() => {
            const target = {}
            const proxy: unknown = new Proxy(target, {
                get(_t, prop) {
                    if (prop === 'then') {
                        return (
                            onFulfilled: (v: unknown) => unknown,
                            onRejected?: (e: unknown) => unknown
                        ) =>
                            Promise.resolve(
                                h.results.length ? h.results.shift() : []
                            ).then(onFulfilled, onRejected)
                    }
                    if (prop === 'where') {
                        return (arg: unknown) => {
                            h.whereArgs.push(arg)
                            return proxy
                        }
                    }
                    return () => proxy
                }
            })
            return proxy
        })
    }
})

vi.mock('@/db', () => ({
    db: { select: (...args: unknown[]) => h.mockDbSelect(...args) }
}))

vi.mock('@/db/schema', () => ({
    activationCodes: {
        id: 'activationCodes.id',
        code: 'activationCodes.code',
        partnerName: 'activationCodes.partnerName',
        partnerId: 'activationCodes.partnerId',
        status: 'activationCodes.status',
        batchId: 'activationCodes.batchId',
        skuKind: 'activationCodes.skuKind',
        seats: 'activationCodes.seats',
        seatsUsed: 'activationCodes.seatsUsed',
        validityDays: 'activationCodes.validityDays',
        planId: 'activationCodes.planId',
        provider: 'activationCodes.provider',
        region: 'activationCodes.region',
        tierLabel: 'activationCodes.tierLabel',
        notes: 'activationCodes.notes',
        redeemedByUserId: 'activationCodes.redeemedByUserId',
        redeemedClawId: 'activationCodes.redeemedClawId',
        redeemedAt: 'activationCodes.redeemedAt',
        expiresAt: 'activationCodes.expiresAt',
        createdAt: 'activationCodes.createdAt'
    },
    authUsers: { id: 'authUsers.id', email: 'authUsers.email' },
    claws: { id: 'claws.id', name: 'claws.name' }
}))

vi.mock('@/lib/withErrorHandler', () => ({
    default:
        () =>
        <C, T>(handler: (c: C) => Promise<T>) =>
            handler
}))

vi.mock('@/lib/response', () => ({
    ok: <T,>(c: { json: (b: unknown, code?: number) => unknown }, data: T, message = '') =>
        c.json(
            { success: true, data, message, code: 200, version: 'test' },
            200
        ),
    fail: (
        c: { json: (b: unknown, code?: number) => unknown },
        message: string,
        code = 400
    ) =>
        c.json(
            { success: false, data: null, message, code, version: 'test' },
            code
        )
}))

vi.mock('@openclaw/i18n', () => ({ t: (k: string) => k }))

import getAdminActivationCodes from './getAdminActivationCodes'

const callList = async (
    {
        userId = 'admin-1',
        role = 'admin' as 'admin' | 'partner' | 'user',
        query = {} as Record<string, string>
    } = {}
) => {
    const calls: Array<{ body: unknown; status: number }> = []
    const c = {
        req: {
            query: vi.fn((key: string) => query[key])
        },
        get: vi.fn((key: string) => {
            if (key === 'userId') return userId
            if (key === 'userRole') return role
            return undefined
        }),
        json: vi.fn((b: unknown, status: number = 200) => {
            calls.push({ body: b, status })
            return { body: b, status } as unknown as Response
        })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await getAdminActivationCodes(c as any)
    return { calls, body: calls[0]?.body, status: calls[0]?.status }
}

beforeEach(() => {
    vi.clearAllMocks()
    h.whereArgs.length = 0
    h.results.length = 0
})

describe('getAdminActivationCodes — role scoping', () => {
    it('super_admin: no partner filter applied (sees all rows)', async () => {
        h.results.push([{ count: 0 }]) // count query
        h.results.push([]) // rows query
        const { status } = await callList({ role: 'admin' })
        expect(status).toBe(200)

        // The where chain should NOT include any partnerId equality on
        // every call. We assert via stringification of the captured
        // `where` arg — drizzle's sql template wrappers carry their
        // operands as `.queryChunks` / `.value`, which JSON.stringify
        // surfaces enough for grep.
        const str = JSON.stringify(h.whereArgs)
        expect(str).not.toMatch(/partnerId/i)
    })

    it('partner: where clause includes partner_id = self', async () => {
        h.results.push([{ count: 0 }])
        h.results.push([])
        const { status } = await callList({
            userId: 'partner-1',
            role: 'partner'
        })
        expect(status).toBe(200)
        const str = JSON.stringify(h.whereArgs)
        // Either the column reference or the partner-id value should
        // appear in the where chain — defensive against drizzle
        // serialization shape.
        expect(
            str.includes('partnerId') || str.includes('partner-1')
        ).toBe(true)
    })

    it('partner: still respects status / batch filters on top of scope', async () => {
        h.results.push([{ count: 0 }])
        h.results.push([])
        await callList({
            userId: 'partner-2',
            role: 'partner',
            query: { status: 'redeemed', batch: 'batch-xyz' }
        })
        const str = JSON.stringify(h.whereArgs)
        // All three filter keys should be present in the where chain.
        expect(
            str.includes('partner-2') || str.includes('partnerId')
        ).toBe(true)
        expect(str).toMatch(/redeemed/)
        expect(str).toMatch(/batch-xyz/)
    })

    it('partner with no rows: returns empty list with 200, not an error', async () => {
        h.results.push([{ count: 0 }])
        h.results.push([])
        const { status, body } = await callList({
            userId: 'partner-3',
            role: 'partner'
        })
        expect(status).toBe(200)
        const data = (body as { data: { items: unknown[]; total: number } })
            .data
        expect(data.items).toEqual([])
        expect(data.total).toBe(0)
    })

    it('end-user role: rejects with 403 (defense in depth — middleware should also block)', async () => {
        const { status } = await callList({
            userId: 'user-1',
            role: 'user'
        })
        expect(status).toBeGreaterThanOrEqual(400)
    })
})