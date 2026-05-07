import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => {
    const updateCalls: Array<{ values: unknown }> = []
    let nextReturning: unknown[] = []
    return {
        updateCalls,
        setNextReturning(rows: unknown[]) {
            nextReturning = rows
        },
        mockUpdate: vi.fn(() => ({
            set: (vals: unknown) => ({
                where: () => ({
                    returning: () => {
                        updateCalls.push({ values: vals })
                        return Promise.resolve(nextReturning)
                    }
                })
            })
        }))
    }
})

vi.mock('@/db', () => ({ db: { update: () => h.mockUpdate() } }))

vi.mock('@/db/schema', () => ({
    intents: { id: 'intents.id', clawId: 'intents.clawId' }
}))

vi.mock('@/lib/withErrorHandler', () => ({
    default:
        () =>
        <C, T>(handler: (c: C) => Promise<T>) =>
            handler
}))

vi.mock('@/lib/response', () => ({
    ok: <T,>(c: { json: (b: unknown, code?: number) => unknown }, data: T) =>
        c.json({ success: true, data, code: 200 }, 200),
    fail: (
        c: { json: (b: unknown, code?: number) => unknown },
        message: string,
        code = 400
    ) => c.json({ success: false, message, code }, code)
}))

vi.mock('@openclaw/i18n', () => ({ t: (k: string) => k }))

import postLastPreview from './postLastPreview'

const callPost = async (
    body: Record<string, unknown> | undefined,
    { clawId = 'claw-1' }: { clawId?: string } = {}
) => {
    const calls: Array<{ body: unknown; status: number }> = []
    const c = {
        req: {
            json: vi.fn(async () => body ?? {}),
            param: vi.fn((k: string) => (k === 'clawId' ? clawId : undefined))
        },
        json: vi.fn((b: unknown, status: number = 200) => {
            calls.push({ body: b, status })
            return { body: b, status } as unknown as Response
        })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await postLastPreview(c as any)
    return { status: calls[0]?.status, body: calls[0]?.body }
}

beforeEach(() => {
    h.updateCalls.length = 0
    h.setNextReturning([])
    h.mockUpdate.mockClear()
})

describe('postLastPreview', () => {
    it('rejects missing intentId', async () => {
        h.setNextReturning([])
        const { status } = await callPost({ preview: 'hi' })
        expect(status).toBe(400)
    })

    it('rejects invalid `at` timestamp', async () => {
        const { status } = await callPost({
            intentId: 'i-1',
            preview: 'hi',
            at: 'not-a-date'
        })
        expect(status).toBe(400)
    })

    it('truncates oversized preview to 4KB', async () => {
        h.setNextReturning([{ id: 'i-1' }])
        const huge = 'x'.repeat(10_000)
        await callPost({ intentId: 'i-1', preview: huge })
        const setVals = h.updateCalls[0]?.values as {
            lastMessagePreview: string
        }
        expect(setVals.lastMessagePreview.length).toBe(4 * 1024)
    })

    it('returns 404 when intent does not belong to this claw', async () => {
        h.setNextReturning([])
        const { status } = await callPost({
            intentId: 'i-other',
            preview: 'hi'
        })
        expect(status).toBe(404)
    })

    it('happy path: updates the row and returns the intentId', async () => {
        h.setNextReturning([{ id: 'i-1' }])
        const { status } = await callPost({
            intentId: 'i-1',
            preview: 'hello world'
        })
        expect(status).toBe(200)
        const setVals = h.updateCalls[0]?.values as {
            lastMessagePreview: string
            lastMessageAt: Date
            updatedAt: Date
        }
        expect(setVals.lastMessagePreview).toBe('hello world')
        expect(setVals.lastMessageAt).toBeInstanceOf(Date)
    })

    it('uses provided `at` ISO when valid', async () => {
        h.setNextReturning([{ id: 'i-1' }])
        const iso = '2026-04-15T12:00:00.000Z'
        await callPost({ intentId: 'i-1', preview: 'hi', at: iso })
        const setVals = h.updateCalls[0]?.values as { lastMessageAt: Date }
        expect(setVals.lastMessageAt.toISOString()).toBe(iso)
    })
})