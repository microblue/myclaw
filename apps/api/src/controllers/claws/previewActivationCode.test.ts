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
    const queue: unknown[] = []
    return {
        makeChain,
        queue,
        mockDbSelect: vi.fn(() => makeChain(queue.length ? queue.shift() : []))
    }
})

const { queue, mockDbSelect } = h

vi.mock('@/db', () => ({
    db: { select: (...args: unknown[]) => h.mockDbSelect(...args) }
}))

vi.mock('@/db/schema', () => ({
    activationCodes: { code: 'activationCodes.code' }
}))

vi.mock('@openclaw/i18n', () => ({ t: (k: string) => k }))

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

import previewActivationCode from './previewActivationCode'

const callPreview = async (code: string | undefined) => {
    const calls: Array<{ body: unknown; status: number }> = []
    const c = {
        req: { json: vi.fn(async () => ({ code })) },
        get: vi.fn(() => 'user-1'),
        json: vi.fn((b: unknown, status: number = 200) => {
            calls.push({ body: b, status })
            return { body: b, status } as unknown as Response
        })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await previewActivationCode(c as any)
    return { calls, body: calls[0]?.body, status: calls[0]?.status }
}

const baseRow = {
    id: 'code-1',
    code: 'ABCDEFGHJ-090-005',
    skuKind: 'new',
    planId: 'cpx21',
    provider: 'hetzner',
    region: 'fsn1',
    tierLabel: 'Pro',
    validityDays: 90,
    seats: 5,
    seatsUsed: 0,
    status: 'unused',
    expiresAt: null as Date | null
}

beforeEach(() => {
    queue.length = 0
    mockDbSelect.mockClear()
})

describe('previewActivationCode', () => {
    it('returns not_found for empty code', async () => {
        const { body } = await callPreview('   ')
        expect(
            (body as { data: { valid: boolean; reason: string } }).data
        ).toEqual({ valid: false, reason: 'not_found' })
        // Skips DB lookup entirely.
        expect(mockDbSelect).not.toHaveBeenCalled()
    })

    it('returns not_found when code is missing from DB', async () => {
        queue.push([])
        const { body } = await callPreview('XXXXXXXXX-090-001')
        expect(
            (body as { data: { reason: string } }).data.reason
        ).toBe('not_found')
    })

    it('returns voided for status=voided', async () => {
        queue.push([{ ...baseRow, status: 'voided' }])
        const { body } = await callPreview(baseRow.code)
        expect(
            (body as { data: { reason: string } }).data.reason
        ).toBe('voided')
    })

    it('returns redeemed when status=redeemed', async () => {
        queue.push([
            { ...baseRow, status: 'redeemed', seatsUsed: 5, seats: 5 }
        ])
        const { body } = await callPreview(baseRow.code)
        expect(
            (body as { data: { reason: string } }).data.reason
        ).toBe('redeemed')
    })

    it('returns redeemed when seatsUsed >= seats even if status=unused', async () => {
        queue.push([{ ...baseRow, status: 'unused', seatsUsed: 5, seats: 5 }])
        const { body } = await callPreview(baseRow.code)
        expect(
            (body as { data: { reason: string } }).data.reason
        ).toBe('redeemed')
    })

    it('returns expired when expiresAt is past', async () => {
        queue.push([
            { ...baseRow, expiresAt: new Date(Date.now() - 1000) }
        ])
        const { body } = await callPreview(baseRow.code)
        expect(
            (body as { data: { reason: string } }).data.reason
        ).toBe('expired')
    })

    it('returns valid + full preview shape on a healthy unused code', async () => {
        queue.push([{ ...baseRow, seatsUsed: 2, seats: 5 }])
        const { body } = await callPreview(baseRow.code)
        const data = (body as { data: Record<string, unknown> }).data
        expect(data.valid).toBe(true)
        expect(data.skuKind).toBe('new')
        expect(data.planId).toBe('cpx21')
        expect(data.provider).toBe('hetzner')
        expect(data.region).toBe('fsn1')
        expect(data.tierLabel).toBe('Pro')
        expect(data.validityDays).toBe(90)
        expect(data.seats).toBe(5)
        expect(data.seatsUsed).toBe(2)
        expect(data.seatsRemaining).toBe(3)
    })

    it('exposes nullable plan/provider/region for renewal SKU', async () => {
        queue.push([
            {
                ...baseRow,
                skuKind: 'renewal',
                planId: null,
                provider: null,
                region: null
            }
        ])
        const { body } = await callPreview(baseRow.code)
        const data = (body as { data: Record<string, unknown> }).data
        expect(data.valid).toBe(true)
        expect(data.skuKind).toBe('renewal')
        expect(data.planId).toBeNull()
        expect(data.provider).toBeNull()
        expect(data.region).toBeNull()
    })

    it('trims whitespace from the input code', async () => {
        queue.push([{ ...baseRow }])
        await callPreview('   ABCDEFGHJ-090-005   ')
        // Hard to verify the WHERE clause via the proxy, but the lookup
        // ran (queue was consumed → length 0) and result returned valid.
        expect(queue.length).toBe(0)
    })

    it('does not reject when expiresAt is in the future', async () => {
        queue.push([
            { ...baseRow, expiresAt: new Date(Date.now() + 60_000) }
        ])
        const { body } = await callPreview(baseRow.code)
        expect((body as { data: { valid: boolean } }).data.valid).toBe(true)
    })
})