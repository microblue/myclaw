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
    const selectQueue: unknown[] = []
    const insertCalls: Array<{ table: unknown; values: unknown }> = []
    return {
        selectQueue,
        insertCalls,
        mockSelect: vi.fn(() => makeChain(selectQueue.shift() ?? [])),
        mockInsert: vi.fn((table: unknown) => ({
            values: (vals: unknown) => {
                insertCalls.push({ table, values: vals })
                return Promise.resolve()
            }
        }))
    }
})

vi.mock('@/db', () => ({
    db: {
        select: (...args: unknown[]) => h.mockSelect(...args),
        insert: (table: unknown) => h.mockInsert(table)
    }
}))

vi.mock('@/db/schema', () => ({
    intents: { __table: 'intents', id: 'intents.id', clawId: 'intents.clawId' },
    intentAgents: { __table: 'intent_agents' },
    claws: { id: 'claws.id', userId: 'claws.userId' }
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

import createIntent from './createIntent'

const callCreate = async (body: Record<string, unknown> | undefined) => {
    const calls: Array<{ body: unknown; status: number }> = []
    const c = {
        get: vi.fn((k: string) => (k === 'userId' ? 'user-1' : undefined)),
        req: {
            json: vi.fn(async () => body ?? {})
        },
        json: vi.fn((b: unknown, status: number = 200) => {
            calls.push({ body: b, status })
            return { body: b, status } as unknown as Response
        })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createIntent(c as any)
    return { calls, body: calls[0]?.body, status: calls[0]?.status }
}

beforeEach(() => {
    h.selectQueue.length = 0
    h.insertCalls.length = 0
    h.mockSelect.mockClear()
    h.mockInsert.mockClear()
})

describe('createIntent', () => {
    it('rejects when clawId is missing', async () => {
        const { status } = await callCreate({ title: 'My intent' })
        expect(status).toBe(400)
    })

    it('rejects when title is missing', async () => {
        const { status } = await callCreate({ clawId: 'claw-1' })
        expect(status).toBe(400)
    })

    it('rejects when title is whitespace-only', async () => {
        const { status } = await callCreate({
            clawId: 'claw-1',
            title: '   '
        })
        expect(status).toBe(400)
    })

    it('rejects title exceeding 160 characters', async () => {
        const { status } = await callCreate({
            clawId: 'claw-1',
            title: 'x'.repeat(200)
        })
        expect(status).toBe(400)
    })

    it('rejects when claw does not belong to user', async () => {
        // First select returns empty (claw lookup) → not found
        h.selectQueue.push([])
        const { status } = await callCreate({
            clawId: 'foreign-claw',
            title: 'Hi'
        })
        expect(status).toBe(404)
    })

    it('inserts intent + orchestrator agent on success', async () => {
        // claw lookup returns owner row
        h.selectQueue.push([{ id: 'claw-1' }])
        // post-insert select returns the row
        h.selectQueue.push([
            {
                id: 'will-be-set',
                clawId: 'claw-1',
                title: 'Plan trip'
            }
        ])
        const { status } = await callCreate({
            clawId: 'claw-1',
            title: '  Plan trip  '
        })
        expect(status).toBe(200)
        expect(h.insertCalls.length).toBe(2)
        const intentInsert = h.insertCalls[0]?.values as {
            title: string
            clawId: string
            userId: string
        }
        expect(intentInsert.title).toBe('Plan trip')
        expect(intentInsert.clawId).toBe('claw-1')
        expect(intentInsert.userId).toBe('user-1')
        const agentInsert = h.insertCalls[1]?.values as {
            agentKey: string
            isOrchestrator: boolean
        }
        expect(agentInsert.agentKey).toBe('orchestrator')
        expect(agentInsert.isOrchestrator).toBe(true)
    })
})