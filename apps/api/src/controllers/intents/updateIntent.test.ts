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

vi.mock('@/db', () => ({
    db: { update: () => h.mockUpdate() }
}))

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

import updateIntent from './updateIntent'

const callUpdate = async (
    body: Record<string, unknown>,
    { id = 'intent-1' }: { id?: string } = {}
) => {
    const calls: Array<{ body: unknown; status: number }> = []
    const c = {
        get: vi.fn((k: string) => (k === 'userId' ? 'user-1' : undefined)),
        req: {
            json: vi.fn(async () => body),
            param: vi.fn(() => id)
        },
        json: vi.fn((b: unknown, status: number = 200) => {
            calls.push({ body: b, status })
            return { body: b, status } as unknown as Response
        })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await updateIntent(c as any)
    return { body: calls[0]?.body, status: calls[0]?.status }
}

beforeEach(() => {
    h.updateCalls.length = 0
    h.setNextReturning([])
    h.mockUpdate.mockClear()
})

describe('updateIntent', () => {
    it('rejects empty body (no fields)', async () => {
        const { status } = await callUpdate({})
        expect(status).toBe(400)
    })

    it('rejects empty title', async () => {
        const { status } = await callUpdate({ title: '   ' })
        expect(status).toBe(400)
    })

    it('rejects title exceeding 160 chars', async () => {
        const { status } = await callUpdate({ title: 'x'.repeat(200) })
        expect(status).toBe(400)
    })

    it('updates title (trimmed) when provided', async () => {
        h.setNextReturning([{ id: 'intent-1', title: 'Renamed' }])
        const { status } = await callUpdate({ title: '  Renamed  ' })
        expect(status).toBe(200)
        const setVals = h.updateCalls[0]?.values as {
            title: string
            updatedAt: Date
        }
        expect(setVals.title).toBe('Renamed')
        expect(setVals.updatedAt).toBeInstanceOf(Date)
    })

    it('archives by setting archivedAt to now when archived=true', async () => {
        h.setNextReturning([{ id: 'intent-1' }])
        await callUpdate({ archived: true })
        const setVals = h.updateCalls[0]?.values as { archivedAt: Date | null }
        expect(setVals.archivedAt).toBeInstanceOf(Date)
    })

    it('un-archives by clearing archivedAt to null when archived=false', async () => {
        h.setNextReturning([{ id: 'intent-1' }])
        await callUpdate({ archived: false })
        const setVals = h.updateCalls[0]?.values as { archivedAt: Date | null }
        expect(setVals.archivedAt).toBeNull()
    })

    it('returns 404 when row not found / not owned by caller', async () => {
        h.setNextReturning([])
        const { status } = await callUpdate({ title: 'New' })
        expect(status).toBe(404)
    })
})