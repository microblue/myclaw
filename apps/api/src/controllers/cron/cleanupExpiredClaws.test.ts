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
        mockDbSelect: vi.fn(() => makeChain(queue.length ? queue.shift() : [])),
        mockCleanupClaw: vi.fn(() => Promise.resolve({ success: true }))
    }
})

vi.mock('@/db', () => ({
    db: { select: (...args: unknown[]) => h.mockDbSelect(...args) }
}))

vi.mock('@/db/schema', () => ({
    claws: {
        id: 'claws.id',
        provider: 'claws.provider',
        location: 'claws.location',
        providerServerId: 'claws.providerServerId',
        subdomain: 'claws.subdomain',
        deletionScheduledAt: 'claws.deletionScheduledAt'
    }
}))

vi.mock('@/controllers/claws/helpers', () => ({
    cleanupClaw: h.mockCleanupClaw
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

import { runCleanupExpiredClaws } from './cleanupExpiredClaws'

beforeEach(() => {
    h.queue.length = 0
    h.mockDbSelect.mockClear()
    h.mockCleanupClaw.mockReset()
    h.mockCleanupClaw.mockImplementation(() => Promise.resolve({ success: true }))
})

describe('runCleanupExpiredClaws', () => {
    it('returns zero counts when no claws are expired', async () => {
        h.queue.push([])
        const res = await runCleanupExpiredClaws()
        expect(res).toEqual({ swept: 0, succeeded: 0, failed: 0 })
        expect(h.mockCleanupClaw).not.toHaveBeenCalled()
    })

    it('calls cleanupClaw with the per-claw context for each expired row', async () => {
        h.queue.push([
            {
                id: 'claw-1',
                provider: 'hetzner',
                location: 'fsn1',
                providerServerId: 'srv-1',
                subdomain: 'sub-1'
            },
            {
                id: 'claw-2',
                provider: 'lightsail',
                location: 'us-east-1',
                providerServerId: 'srv-2',
                subdomain: 'sub-2'
            }
        ])
        const res = await runCleanupExpiredClaws()
        expect(res).toEqual({ swept: 2, succeeded: 2, failed: 0 })
        expect(h.mockCleanupClaw).toHaveBeenCalledTimes(2)
        // Critical: each call gets that claw's own provider/location, not
        // a shared default — a previous regression mixed them up.
        expect(h.mockCleanupClaw).toHaveBeenNthCalledWith(1, 'claw-1', {
            provider: 'hetzner',
            location: 'fsn1',
            providerServerId: 'srv-1',
            subdomain: 'sub-1'
        })
        expect(h.mockCleanupClaw).toHaveBeenNthCalledWith(2, 'claw-2', {
            provider: 'lightsail',
            location: 'us-east-1',
            providerServerId: 'srv-2',
            subdomain: 'sub-2'
        })
    })

    it('partial failures count as failed but do not abort the batch', async () => {
        h.queue.push([
            { id: 'a', provider: 'hetzner', location: 'fsn1', providerServerId: '1', subdomain: 's-a' },
            { id: 'b', provider: 'hetzner', location: 'fsn1', providerServerId: '2', subdomain: 's-b' },
            { id: 'c', provider: 'hetzner', location: 'fsn1', providerServerId: '3', subdomain: 's-c' }
        ])
        h.mockCleanupClaw
            .mockImplementationOnce(() => Promise.resolve({ success: true }))
            .mockImplementationOnce(() =>
                Promise.reject(new Error('provider unreachable'))
            )
            .mockImplementationOnce(() => Promise.resolve({ success: true }))

        const res = await runCleanupExpiredClaws()
        expect(res.swept).toBe(3)
        expect(res.succeeded).toBe(2)
        expect(res.failed).toBe(1)
        // All three were attempted (Promise.allSettled), not short-circuited
        // by the one that threw.
        expect(h.mockCleanupClaw).toHaveBeenCalledTimes(3)
    })

    it('treats unfulfilled cleanups as failed (rejects bubble up via allSettled)', async () => {
        h.queue.push([
            { id: 'a', provider: 'h', location: 'l', providerServerId: '1', subdomain: 'x' }
        ])
        h.mockCleanupClaw.mockImplementationOnce(() =>
            Promise.reject('string-rejection')
        )
        const res = await runCleanupExpiredClaws()
        expect(res).toEqual({ swept: 1, succeeded: 0, failed: 1 })
    })
})