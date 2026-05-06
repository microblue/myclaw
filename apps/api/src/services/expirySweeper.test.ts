import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
    mockRunCleanup: vi.fn(() => Promise.resolve())
}))

vi.mock('@/controllers/cron', () => ({
    runCleanupExpiredClaws: h.mockRunCleanup
}))

// expirySweeper holds a module-level `timer` to enforce singleton
// behavior in production. For tests we reset the module between cases
// so each test gets a fresh timer slot. Otherwise the second call to
// startExpirySweeper() hits the early-return branch and the test
// observes silence instead of fresh-boot behavior.
const loadSweeper = async () => {
    vi.resetModules()
    return (await import('./expirySweeper')).default
}

beforeEach(() => {
    vi.useFakeTimers()
    h.mockRunCleanup.mockClear()
    h.mockRunCleanup.mockImplementation(() => Promise.resolve())
})

afterEach(() => {
    vi.useRealTimers()
})

describe('expirySweeper', () => {
    it('runs cleanup immediately on first invocation', async () => {
        const startExpirySweeper = await loadSweeper()
        startExpirySweeper()
        await Promise.resolve()
        expect(h.mockRunCleanup).toHaveBeenCalledTimes(1)
    })

    it('is idempotent across calls within a single module instance', async () => {
        const startExpirySweeper = await loadSweeper()
        startExpirySweeper()
        startExpirySweeper()
        startExpirySweeper()
        await Promise.resolve()
        // Only the first call fires the boot pass; subsequent calls return
        // early because `timer` is already set.
        expect(h.mockRunCleanup).toHaveBeenCalledTimes(1)
    })

    it('runs cleanup again after one hour', async () => {
        const startExpirySweeper = await loadSweeper()
        startExpirySweeper()
        await Promise.resolve()
        const before = h.mockRunCleanup.mock.calls.length

        await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
        expect(h.mockRunCleanup.mock.calls.length).toBe(before + 1)
    })

    it('survives a cleanup error and keeps running on the next tick', async () => {
        h.mockRunCleanup
            .mockImplementationOnce(() =>
                Promise.reject(new Error('boom'))
            )
            .mockImplementation(() => Promise.resolve())

        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const startExpirySweeper = await loadSweeper()
        startExpirySweeper()
        // Two awaits to let both the boot promise and its catch handler
        // settle (mockRunCleanup → reject → caught by `.catch` chain).
        await Promise.resolve()
        await Promise.resolve()
        expect(errSpy).toHaveBeenCalled()

        const before = h.mockRunCleanup.mock.calls.length
        await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
        expect(h.mockRunCleanup.mock.calls.length).toBeGreaterThan(before)

        errSpy.mockRestore()
    })
})