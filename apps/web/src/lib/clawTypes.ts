// Claw type registry — single source of truth for the wizard picker
// and the dashboard badge on each instance.
//
// Only 'openclaw' is selectable in Phase 1. The other four render as
// Coming soon cards: discoverable but disabled.

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
        description: 'Smallest memory footprint (256 MB target). Great for free tier and always-on background tasks.',
        comingSoon: true
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