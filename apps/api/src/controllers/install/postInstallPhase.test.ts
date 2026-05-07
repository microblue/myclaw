import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => {
    return {
        insertCalls: [] as unknown[][],
        updateCalls: [] as unknown[][],
        mockDbInsert: vi.fn(),
        mockDbUpdate: vi.fn()
    }
})

vi.mock('@/db', () => ({
    db: {
        insert: () => ({
            values: (rows: unknown) => {
                h.insertCalls.push([rows])
                return Promise.resolve()
            }
        }),
        update: () => ({
            set: (vals: unknown) => ({
                where: () => {
                    h.updateCalls.push([vals])
                    return Promise.resolve()
                }
            })
        })
    }
}))

vi.mock('@/db/schema', () => ({
    claws: {
        id: 'claws.id',
        installRunId: 'claws.installRunId'
    },
    clawInstallPhases: {
        id: 'clawInstallPhases.id',
        clawId: 'clawInstallPhases.clawId',
        installRunId: 'clawInstallPhases.installRunId',
        phase: 'clawInstallPhases.phase',
        logChunk: 'clawInstallPhases.logChunk'
    }
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
    ) => c.json({ success: false, message, code }, code)
}))

vi.mock('@openclaw/i18n', () => ({ t: (k: string) => k }))

import postInstallPhase from './postInstallPhase'

const ALLOWED_PHASES = [
    'renting_compute',
    'mounting_storage',
    'installing_kernel',
    'loading_skills',
    'calibrating_agents',
    'wiring_network',
    'issuing_certificate',
    'installing_studio',
    'ready',
    'failed'
]

const callPhase = async (
    body: Record<string, unknown> | undefined,
    {
        clawId = 'claw-1'
    }: { clawId?: string } = {}
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
    await postInstallPhase(c as any)
    return { calls, body: calls[0]?.body, status: calls[0]?.status }
}

beforeEach(() => {
    h.insertCalls.length = 0
    h.updateCalls.length = 0
    h.mockDbInsert.mockClear()
    h.mockDbUpdate.mockClear()
})

describe('postInstallPhase', () => {
    it('rejects missing phase field', async () => {
        const { status } = await callPhase({ runId: 'r-1', logTail: '' })
        expect(status).toBe(400)
        expect(h.insertCalls.length).toBe(0)
    })

    it('rejects unknown phase string (phase enumeration enforced)', async () => {
        const { status, body } = await callPhase({
            phase: 'wormhole_traversal',
            runId: 'r-1',
            logTail: ''
        })
        expect(status).toBe(400)
        expect((body as { message: string }).message).toMatch(/phase/i)
    })

    it.each(ALLOWED_PHASES)(
        'accepts allowed phase %s',
        async (phase) => {
            const { status } = await callPhase({
                phase,
                runId: 'r-1',
                logTail: 'log line'
            })
            expect(status).toBe(200)
            expect(h.insertCalls.length).toBe(1)
        }
    )

    it('rejects missing runId', async () => {
        const { status } = await callPhase({
            phase: 'renting_compute',
            logTail: ''
        })
        expect(status).toBe(400)
    })

    it('truncates oversized logTail (defense against runaway uploads)', async () => {
        const huge = 'x'.repeat(2_000_000) // 2MB
        const { status } = await callPhase({
            phase: 'renting_compute',
            runId: 'r-1',
            logTail: huge
        })
        // Either truncated + 200, or rejected with 413 — both acceptable.
        if (status === 200) {
            const inserted = h.insertCalls[0]?.[0] as {
                logChunk: string
            }
            expect(inserted.logChunk.length).toBeLessThan(huge.length)
        } else {
            expect(status).toBe(413)
        }
    })

    it('inserts a row with the claw_id from URL param + the body fields', async () => {
        await callPhase(
            {
                phase: 'mounting_storage',
                runId: 'run-abc',
                logTail: '+ mkfs.ext4 /dev/loop0'
            },
            { clawId: 'claw-xyz' }
        )
        const row = h.insertCalls[0]?.[0] as {
            clawId: string
            installRunId: string
            phase: string
            logChunk: string
        }
        expect(row.clawId).toBe('claw-xyz')
        expect(row.installRunId).toBe('run-abc')
        expect(row.phase).toBe('mounting_storage')
        expect(row.logChunk).toContain('mkfs.ext4')
    })

    it('mirrors install_run_id onto claws row so subscribers can find the active run', async () => {
        await callPhase({
            phase: 'renting_compute',
            runId: 'run-fresh',
            logTail: ''
        })
        // updates claws.install_run_id = the new runId
        expect(h.updateCalls.length).toBe(1)
        const setVals = h.updateCalls[0]?.[0] as { installRunId: string }
        expect(setVals.installRunId).toBe('run-fresh')
    })
})