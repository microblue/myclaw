// Claw type registry — single source of truth for the wizard picker
// and the dashboard badge on each instance.
//
// Phase 1: OpenClaw + PicoClaw are provisionable. The other three
// (zeroclaw / hermes / nanoclaw) render as Coming soon cards:
// discoverable but disabled. When a new adapter lands on the server
// in services/clawRuntimes/, flip its `comingSoon: false` here and
// the wizard picks it up.

export interface ClawTypeEntry {
    id: string
    name: string
    tagline: string
    description: string
    comingSoon: boolean
}

export const CLAW_TYPES: ClawTypeEntry[] = [
    {
        id: 'openclaw',
        name: 'OpenClaw',
        tagline: 'Full AI assistant',
        description: 'The flagship OpenClaw instance — full tool access, multi-agent, suitable for day-to-day work.',
        comingSoon: false
    },
    {
        id: 'zeroclaw',
        name: 'ZeroClaw',
        tagline: 'Barebones kernel',
        description: 'Minimal footprint, no built-in tools. For users who want to ship their own agent on top of the runtime.',
        comingSoon: true
    },
    {
        id: 'picoclaw',
        name: 'PicoClaw',
        tagline: 'Tiny & fast',
        description: 'Sub-10 MB core (Go static binary). Runs on the smallest VPS tier — great for always-on background tasks on a tight budget.',
        comingSoon: false
    },
    {
        id: 'hermes',
        name: 'Hermes Agent',
        tagline: 'Delivery specialist',
        description: 'Pre-wired for API orchestration and background jobs — no chat UI, runs headless.',
        comingSoon: true
    },
    {
        id: 'nanoclaw',
        name: 'NanoClaw',
        tagline: 'Edge-ready',
        description: 'Optimised for edge runtimes and tiny VPSes. Lean plugin set, 24/7 always-on budget.',
        comingSoon: true
    }
]

export const getClawType = (id: string): ClawTypeEntry | undefined =>
    CLAW_TYPES.find((t) => t.id === id)