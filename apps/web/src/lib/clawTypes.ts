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
    // Tailwind class pair for the type pill / chip (dashboard tile,
    // detail header, admin claws list). Subtle fill + darker text so
    // OpenClaw vs PicoClaw is distinguishable at a glance without
    // competing with the status dot.
    badgeClass: string
}

export const CLAW_TYPES: ClawTypeEntry[] = [
    {
        id: 'openclaw',
        name: 'OpenClaw',
        tagline: 'Full AI assistant',
        description: 'The flagship OpenClaw instance — full tool access, multi-agent, suitable for day-to-day work.',
        comingSoon: false,
        badgeClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-300'
    },
    {
        id: 'zeroclaw',
        name: 'ZeroClaw',
        tagline: 'Barebones kernel',
        description: 'Minimal footprint, no built-in tools. For users who want to ship their own agent on top of the runtime.',
        comingSoon: true,
        badgeClass: 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
    },
    {
        id: 'picoclaw',
        name: 'PicoClaw',
        tagline: 'Tiny & fast',
        description: 'Sub-10 MB core (Go static binary). Runs on the smallest VPS tier — great for always-on background tasks on a tight budget.',
        comingSoon: false,
        badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
    },
    {
        id: 'hermes',
        name: 'Hermes Agent',
        tagline: 'Delivery specialist',
        description: 'Pre-wired for API orchestration and background jobs — no chat UI, runs headless.',
        comingSoon: true,
        badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
    },
    {
        id: 'nanoclaw',
        name: 'NanoClaw',
        tagline: 'Edge-ready',
        description: 'Optimised for edge runtimes and tiny VPSes. Lean plugin set, 24/7 always-on budget.',
        comingSoon: true,
        badgeClass: 'bg-violet-500/15 text-violet-600 dark:text-violet-300'
    }
]

export const getClawType = (id: string): ClawTypeEntry | undefined =>
    CLAW_TYPES.find((t) => t.id === id)