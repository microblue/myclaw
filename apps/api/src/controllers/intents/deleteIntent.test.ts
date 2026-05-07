import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => {
    let nextReturning: unknown[] = []
    return {
        setNextReturning(rows: unknown[]) {
            nextReturning = rows
        },
        mockDelete: vi.fn(() => ({
            where: () => ({
                returning: () => Promise.resolve(nextReturning)
            })
        }))
    }
})

vi.mock('@/db', () => ({ db: { delete: () => h.mockDelete() } }))

vi.mock('@/db/schema', () => ({
    intents: { id: 'intents.id', userId: 'intents.userId' }
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

import deleteIntent from './deleteIntent'

const callDelete = async (id: string | undefined) => {
    const calls: Array<{ body: unknown; status: number }> = []
    const c = {
        get: vi.fn((k: string) => (k === 'userId' ? 'user-1' : undefined)),
        req: { param: vi.fn(() => id) },
        json: vi.fn((b: unknown, status: number = 200) => {
            calls.push({ body: b, status })
            return { body: b, status } as unknown as Response
        })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await deleteIntent(c as any)
    return { status: calls[0]?.status, body: calls[0]?.body }
}

beforeEach(() => {
    h.setNextReturning([])
    h.mockDelete.mockClear()
})

describe('deleteIntent', () => {
    it('rejects when id is missing', async () => {
        const { status } = await callDelete(undefined)
        expect(status).toBe(400)
    })

    it('returns 404 when row not found / not owned', async () => {
        h.setNextReturning([])
        const { status } = await callDelete('intent-1')
        expect(status).toBe(404)
    })

    it('returns 200 with the deleted id on success', async () => {
        h.setNextReturning([{ id: 'intent-1' }])
        const { status, body } = await callDelete('intent-1')
        expect(status).toBe(200)
        expect((body as { data: { id: string } }).data.id).toBe('intent-1')
    })
})