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
        insertCalls: [] as unknown[][],
        mockDbSelect: vi.fn(() => makeChain(nextOr(queues.select, []))),
        mockDbUpdate: vi.fn(() => makeChain(nextOr(queues.update, []))),
        mockDbInsert: vi.fn((tbl: unknown) => {
            return {
                values: (rows: unknown) => {
                    h.insertCalls.push([tbl, rows])
                    return makeChain(nextOr(queues.insert, undefined))
                }
            }
        })
    }
})

vi.mock('@/db', () => {
    const tx = {
        insert: (tbl: unknown) => h.mockDbInsert(tbl),
        update: (...args: unknown[]) => h.mockDbUpdate(...args),
        select: (...args: unknown[]) => h.mockDbSelect(...args)
    }
    return {
        db: {
            select: (...args: unknown[]) => h.mockDbSelect(...args),
            update: (...args: unknown[]) => h.mockDbUpdate(...args),
            insert: (tbl: unknown) => h.mockDbInsert(tbl),
            transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
                fn(tx)
            )
        }
    }
})

vi.mock('@/db/schema', () => ({
    channelPartners: { userId: 'channelPartners.userId', id: 'cp' },
    partnerQuotas: {
        partnerId: 'partnerQuotas.partnerId',
        skuKind: 'partnerQuotas.skuKind',
        validityDays: 'partnerQuotas.validityDays',
        creditUsd: 'partnerQuotas.creditUsd',
        used: 'partnerQuotas.used',
        total: 'partnerQuotas.total'
    },
    users: { id: 'users.id', role: 'users.role' },
    authUsers: { id: 'authUsers.id', email: 'authUsers.email' },
    auditLog: { id: 'auditLog.id' }
}))

vi.mock('@/lib/withErrorHandler', () => ({
    default:
        () =>
        <C, T>(handler: (c: C) => Promise<T>) =>
            handler
}))

vi.mock('@/lib/response', () => ({
    ok: <T,>(c: { json: (b: unknown, code?: number) => unknown }, data: T, message = '') =>
        c.json({ success: true, data, message, code: 200 }, 200),
    fail: (
        c: { json: (b: unknown, code?: number) => unknown },
        message: string,
        code = 400
    ) => c.json({ success: false, data: null, message, code }, code)
}))

vi.mock('@openclaw/i18n', () => ({ t: (k: string) => k }))

import listPartners from './listPartners'
import createPartner from './createPartner'
import suspendPartner from './suspendPartner'
import grantPartnerQuota from './grantPartnerQuota'

const buildContext = ({
    body,
    query,
    params,
    userId = 'admin-1'
}: {
    body?: unknown
    query?: Record<string, string>
    params?: Record<string, string>
    userId?: string
} = {}) => {
    const calls: Array<{ body: unknown; status: number }> = []
    return {
        c: {
            req: {
                json: vi.fn(async () => body ?? {}),
                query: vi.fn((key: string) => query?.[key]),
                param: vi.fn((key: string) => params?.[key])
            },
            get: vi.fn((key: string) => {
                if (key === 'userId') return userId
                if (key === 'userRole') return 'admin'
                return undefined
            }),
            json: vi.fn((b: unknown, status: number = 200) => {
                calls.push({ body: b, status })
                return { body: b, status } as unknown as Response
            })
        },
        calls
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    h.queues.select.length = 0
    h.queues.update.length = 0
    h.queues.insert.length = 0
    h.insertCalls.length = 0
})

// ─── listPartners ──────────────────────────────────────────────────────

describe('listPartners', () => {
    it('returns rows from the join with quota aggregates', async () => {
        h.queues.select.push([
            {
                userId: 'p-1',
                displayName: 'Partner Alpha',
                status: 'active',
                revenueSharePct: '20',
                createdAt: new Date(),
                email: 'a@p.com',
                quotaTotal: 150,
                quotaUsed: 30
            }
        ])
        const { c, calls } = buildContext()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await listPartners(c as any)
        expect(calls[0].status).toBe(200)
        const items = (calls[0].body as { data: { items: unknown[] } }).data
            .items
        expect(items).toHaveLength(1)
    })

    it('returns empty list cleanly when no partners are registered', async () => {
        h.queues.select.push([])
        const { c, calls } = buildContext()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await listPartners(c as any)
        expect(calls[0].status).toBe(200)
        expect(
            (calls[0].body as { data: { items: unknown[] } }).data.items
        ).toEqual([])
    })
})

// ─── createPartner ─────────────────────────────────────────────────────

describe('createPartner', () => {
    it('rejects missing email', async () => {
        const { c, calls } = buildContext({
            body: { displayName: 'X', revenueSharePct: 0 }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await createPartner(c as any)
        expect(calls[0].status).toBe(400)
    })

    it('rejects missing displayName', async () => {
        const { c, calls } = buildContext({
            body: { email: 'x@y.com', revenueSharePct: 0 }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await createPartner(c as any)
        expect(calls[0].status).toBe(400)
    })

    it('rejects revenueSharePct out of [0, 100]', async () => {
        const { c, calls } = buildContext({
            body: {
                email: 'x@y.com',
                displayName: 'X',
                revenueSharePct: 150
            }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await createPartner(c as any)
        expect(calls[0].status).toBe(400)
    })

    it('returns 404 when no auth user matches email', async () => {
        h.queues.select.push([]) // authUsers lookup → empty
        const { c, calls } = buildContext({
            body: { email: 'ghost@x.com', displayName: 'Ghost' }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await createPartner(c as any)
        expect(calls[0].status).toBe(404)
    })

    it('returns 409 when user is already a partner (idempotency-friendly)', async () => {
        h.queues.select.push([{ id: 'u-1' }]) // authUsers found
        h.queues.select.push([{ userId: 'u-1' }]) // already in channel_partners
        const { c, calls } = buildContext({
            body: { email: 'x@y.com', displayName: 'X' }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await createPartner(c as any)
        expect(calls[0].status).toBe(409)
    })

    it('happy path: flips role, inserts partner row, writes audit row', async () => {
        h.queues.select.push([{ id: 'u-1' }])
        h.queues.select.push([])
        h.queues.select.push([{ role: 'user' }]) // beforeRole
        const { c, calls } = buildContext({
            body: {
                email: 'x@y.com',
                displayName: 'X',
                revenueSharePct: 25
            }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await createPartner(c as any)
        expect(calls[0].status).toBe(200)
        // Three writes inside the transaction: users update, partner
        // insert, audit_log insert.
        expect(h.mockDbUpdate).toHaveBeenCalledTimes(1)
        expect(h.insertCalls.length).toBe(2) // partner + audit
    })
})

// ─── suspendPartner ────────────────────────────────────────────────────

describe('suspendPartner', () => {
    it('rejects missing param', async () => {
        const { c, calls } = buildContext({
            body: { status: 'suspended' }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await suspendPartner(c as any)
        expect(calls[0].status).toBe(400)
    })

    it('rejects unknown status value', async () => {
        const { c, calls } = buildContext({
            params: { id: 'p-1' },
            body: { status: 'banned' }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await suspendPartner(c as any)
        expect(calls[0].status).toBe(400)
    })

    it('returns 404 when partner does not exist', async () => {
        h.queues.select.push([])
        const { c, calls } = buildContext({
            params: { id: 'ghost' },
            body: { status: 'suspended' }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await suspendPartner(c as any)
        expect(calls[0].status).toBe(404)
    })

    it('no-ops when status is already at the target value', async () => {
        h.queues.select.push([{ status: 'suspended' }])
        const { c, calls } = buildContext({
            params: { id: 'p-1' },
            body: { status: 'suspended' }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await suspendPartner(c as any)
        expect(calls[0].status).toBe(200)
        expect(h.mockDbUpdate).not.toHaveBeenCalled()
        expect(h.insertCalls.length).toBe(0)
    })

    it('flips status and writes audit row', async () => {
        h.queues.select.push([{ status: 'active' }])
        const { c, calls } = buildContext({
            params: { id: 'p-1' },
            body: { status: 'suspended' }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await suspendPartner(c as any)
        expect(calls[0].status).toBe(200)
        expect(h.mockDbUpdate).toHaveBeenCalledTimes(1)
        // Audit row inserted.
        expect(h.insertCalls.length).toBe(1)
    })
})

// ─── grantPartnerQuota ─────────────────────────────────────────────────

describe('grantPartnerQuota', () => {
    it('rejects unknown skuKind', async () => {
        const { c, calls } = buildContext({
            params: { id: 'p-1' },
            body: { skuKind: 'unknown', total: 10 }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await grantPartnerQuota(c as any)
        expect(calls[0].status).toBe(400)
    })

    it('rejects day-SKU without validityDays', async () => {
        const { c, calls } = buildContext({
            params: { id: 'p-1' },
            body: { skuKind: 'new_vm_day', total: 10 }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await grantPartnerQuota(c as any)
        expect(calls[0].status).toBe(400)
    })

    it('rejects credit-SKU without creditUsd', async () => {
        const { c, calls } = buildContext({
            params: { id: 'p-1' },
            body: { skuKind: 'new_container_credit', total: 10 }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await grantPartnerQuota(c as any)
        expect(calls[0].status).toBe(400)
    })

    it('rejects total < 1', async () => {
        const { c, calls } = buildContext({
            params: { id: 'p-1' },
            body: {
                skuKind: 'new_vm_day',
                validityDays: 90,
                total: 0
            }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await grantPartnerQuota(c as any)
        expect(calls[0].status).toBe(400)
    })

    it('returns 404 when partner does not exist', async () => {
        h.queues.select.push([]) // partner lookup empty
        const { c, calls } = buildContext({
            params: { id: 'ghost' },
            body: {
                skuKind: 'new_vm_day',
                validityDays: 90,
                total: 100
            }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await grantPartnerQuota(c as any)
        expect(calls[0].status).toBe(404)
    })

    it('inserts new quota row when none exists', async () => {
        h.queues.select.push([{ userId: 'p-1' }]) // partner exists
        h.queues.select.push([]) // no existing quota
        const { c, calls } = buildContext({
            params: { id: 'p-1' },
            body: {
                skuKind: 'new_vm_day',
                validityDays: 90,
                total: 100
            }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await grantPartnerQuota(c as any)
        expect(calls[0].status).toBe(200)
        // Two inserts: partner_quotas + audit_log.
        expect(h.insertCalls.length).toBe(2)
        expect(h.mockDbUpdate).not.toHaveBeenCalled()
    })

    it('extends existing quota by default (adds, does not replace)', async () => {
        h.queues.select.push([{ userId: 'p-1' }])
        h.queues.select.push([{ total: 50, used: 10 }])
        const { c, calls } = buildContext({
            params: { id: 'p-1' },
            body: {
                skuKind: 'new_vm_day',
                validityDays: 90,
                total: 50
            }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await grantPartnerQuota(c as any)
        expect(calls[0].status).toBe(200)
        expect((calls[0].body as { data: { total: number } }).data.total).toBe(
            100
        )
        expect(h.mockDbUpdate).toHaveBeenCalledTimes(1)
    })

    it('replaces existing quota when replace=true', async () => {
        h.queues.select.push([{ userId: 'p-1' }])
        h.queues.select.push([{ total: 50, used: 10 }])
        const { c, calls } = buildContext({
            params: { id: 'p-1' },
            body: {
                skuKind: 'new_vm_day',
                validityDays: 90,
                total: 200,
                replace: true
            }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await grantPartnerQuota(c as any)
        expect(calls[0].status).toBe(200)
        expect((calls[0].body as { data: { total: number } }).data.total).toBe(
            200
        )
    })

    it('refuses to drop total below already-used (no negative remaining)', async () => {
        h.queues.select.push([{ userId: 'p-1' }])
        h.queues.select.push([{ total: 100, used: 80 }])
        const { c, calls } = buildContext({
            params: { id: 'p-1' },
            body: {
                skuKind: 'new_vm_day',
                validityDays: 90,
                total: 50,
                replace: true
            }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await grantPartnerQuota(c as any)
        expect(calls[0].status).toBe(400)
        expect(h.mockDbUpdate).not.toHaveBeenCalled()
    })
})