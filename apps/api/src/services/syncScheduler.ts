import { inArray } from 'drizzle-orm'
import { clawStatus } from '@openclaw/shared'
import { db } from '@/db'
import { claws } from '@/db/schema'
import syncClawServers from '@/controllers/claws/helpers/syncClawServers'

// Why this exists:
//
// `syncClawServers` is the function that flips claws between
// transient lifecycle states (creating → configuring → running, or
// → unreachable on timeout). It also runs the post-bootstrap rescue
// that probes the public subdomain and recovers a claw whose
// `pollLifecycle` stage 2 gave up early — common on OpenClaw because
// chrome+npm+certbot bootstrap takes ~12 min, well past the 6-min
// stage-2 deadline.
//
// Until now sync only ran when a user (or admin) opened a dashboard
// list page that called the syncing controller. If the owner left
// the tab on a detail screen (which polls `GET /claws/:id` — no sync)
// or closed the browser, the claw could sit in `configuring` forever
// even though the VPS was fully healthy. Concretely: cosmic-dune
// (bingliu, 2026-04-22) was healthy on the box for 1h+ but stuck
// `configuring` because no /claws list call from its owner ever
// triggered the rescue.
//
// This scheduler removes the dependency on user behavior. Every 60s
// it scans for claws still in transient states and runs sync over
// just those rows — cheap, narrow, and orthogonal to any UI.

const SYNC_INTERVAL_MS = 60_000

const TRANSIENT_STATUSES = [
    clawStatus.creating,
    clawStatus.configuring,
    clawStatus.initializing,
    clawStatus.starting,
    clawStatus.stopping,
    clawStatus.restarting,
    clawStatus.rebuilding,
    clawStatus.migrating
] as const

const runSyncPass = async (): Promise<void> => {
    const started = Date.now()
    let candidateCount = 0
    try {
        const candidates = await db
            .select()
            .from(claws)
            .where(inArray(claws.status, [...TRANSIENT_STATUSES]))
        candidateCount = candidates.length
        if (candidates.length === 0) return

        const before = new Map(candidates.map((c) => [c.id, c.status]))
        const synced = await syncClawServers(candidates)

        // Only log when something changed, so a steady-state cluster
        // doesn't flood the journal every minute.
        const flipped: string[] = []
        for (const c of synced) {
            const prev = before.get(c.id)
            if (prev && prev !== c.status) {
                flipped.push(`${c.name}: ${prev}→${c.status}`)
            }
        }
        if (flipped.length) {
            const ms = Date.now() - started
            console.log(
                `[syncScheduler] pass done in ${ms}ms — flipped: ${flipped.join(', ')} (scanned ${candidateCount})`
            )
        }
    } catch (err) {
        console.error('[syncScheduler] pass aborted', err)
    }
}

let timer: ReturnType<typeof setInterval> | null = null

const startSyncScheduler = (): void => {
    if (timer) return
    // Stagger initial pass so it doesn't collide with boot-time work
    // (terminalSocket attach, dns reconciler first-run, etc.).
    setTimeout(() => {
        void runSyncPass()
    }, 15_000)
    timer = setInterval(() => {
        void runSyncPass()
    }, SYNC_INTERVAL_MS)
}

export { runSyncPass, startSyncScheduler }
export default startSyncScheduler