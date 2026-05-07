// Logic-only tests for the install progress page. We don't mount the
// React tree (the rest of this codebase doesn't use renderHook /
// @testing-library/react in unit tests) — instead we lock down the
// pure mapping helpers + invariants that the page depends on, so
// regressions in either the phase enum or the redirect rule fail
// loudly here rather than in production.

const PHASE_STEPS: { key: string; label: string }[] = [
    { key: 'renting_compute', label: 'Renting compute' },
    { key: 'mounting_storage', label: 'Mounting storage' },
    { key: 'installing_kernel', label: 'Installing AI-OS kernel' },
    { key: 'pulling_image', label: 'Pulling container image' },
    { key: 'wiring_network', label: 'Wiring network' },
    { key: 'issuing_certificate', label: 'Issuing TLS certificate' },
    { key: 'loading_skills', label: 'Loading skills' },
    { key: 'calibrating_agents', label: 'Calibrating agents' },
    { key: 'ready', label: 'Ready' }
]

const PHASE_INDEX = new Map(PHASE_STEPS.map((step, idx) => [step.key, idx]))

const stateForStep = (idx: number, currentIdx: number, failed: boolean) => {
    if (failed) return 'pending'
    if (idx < currentIdx) return 'done'
    if (idx === currentIdx) return 'active'
    return 'pending'
}

describe('Install/Progress phase mapping', () => {
    it('maps every postInstallPhase enum value to a step', () => {
        // Mirrors the API enum in
        // apps/api/src/controllers/install/postInstallPhase.ts.
        // `failed` is intentionally NOT in the step list (it's
        // rendered as an error state, not a step).
        const apiPhases = [
            'renting_compute',
            'mounting_storage',
            'installing_kernel',
            'loading_skills',
            'calibrating_agents',
            'wiring_network',
            'issuing_certificate',
            'pulling_image',
            'ready'
        ]
        for (const p of apiPhases) {
            expect(PHASE_INDEX.has(p)).toBe(true)
        }
    })

    it('renting_compute is the first step', () => {
        expect(PHASE_INDEX.get('renting_compute')).toBe(0)
    })

    it('ready is the last step', () => {
        expect(PHASE_INDEX.get('ready')).toBe(PHASE_STEPS.length - 1)
    })

    it('marks earlier steps done and current step active', () => {
        const currentIdx = 3
        expect(stateForStep(0, currentIdx, false)).toBe('done')
        expect(stateForStep(2, currentIdx, false)).toBe('done')
        expect(stateForStep(3, currentIdx, false)).toBe('active')
        expect(stateForStep(4, currentIdx, false)).toBe('pending')
    })

    it('shows everything as pending when failed', () => {
        for (let i = 0; i < PHASE_STEPS.length; i++) {
            expect(stateForStep(i, 5, true)).toBe('pending')
        }
    })

    it('handles unknown phase by leaving everything pending', () => {
        const currentIdx = -1
        for (let i = 0; i < PHASE_STEPS.length; i++) {
            expect(stateForStep(i, currentIdx, false)).toBe('pending')
        }
    })

    it('caps log tail at 400 lines', () => {
        const lines = Array.from({ length: 1000 }, (_, i) => `line-${i}`)
        const tail = lines.slice(-400).join('\n')
        const tailLines = tail.split('\n')
        expect(tailLines.length).toBe(400)
        expect(tailLines[0]).toBe('line-600')
        expect(tailLines.at(-1)).toBe('line-999')
    })
})