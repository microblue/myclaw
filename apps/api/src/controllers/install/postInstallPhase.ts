import type { Context } from 'hono'

import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws, clawInstallPhases } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

interface PhaseBody {
    phase?: string
    runId?: string
    logTail?: string
}

// White-listed phase enumeration. The installer can only emit values
// from this set; anything else is a programming error or a forged
// request and gets rejected.
// Order here matches the order the installer actually emits them.
// `pulling_image` was a leftover from the container-mode design and
// never fired on the VM path, so it's gone.
const ALLOWED_PHASES = new Set([
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
])

// Cap a single emit's log payload so a runaway curl doesn't pump
// gigabytes into the table. 256 KB is comfortable for the ~200-line
// tail the installer is supposed to send and lets us notice misuse
// quickly. Hono's default body parser already rejects huge JSON
// bodies; this is belt + suspenders.
const MAX_LOG_BYTES = 256 * 1024

// POST /install/:clawId/phase
// Auth: centralTokenAuth (verifies Bearer matches claws.central_token).
// Body: { phase, runId, logTail }
//
// Each call appends one row to claw_install_phases AND mirrors
// install_run_id onto the claws row so the install page can find the
// current run without requiring a separate handshake. Idempotency at
// the API level is delegated to the upstream Idempotency-Key middleware
// (P1.2 idempotency_keys table) — duplicate emits with the same key
// return the cached response without inserting a second row.
const postInstallPhase = withErrorHandler('postInstallPhase')(
    async (c: Context) => {
        const clawId = c.req.param('clawId')
        if (!clawId) return fail(c, 'clawId required.', 400)

        const body = await c.req
            .json<PhaseBody>()
            .catch(() => ({}) as PhaseBody)

        const phase = body.phase
        const runId = body.runId
        const rawLog = body.logTail ?? ''

        if (!phase) return fail(c, 'phase is required.', 400)
        if (!ALLOWED_PHASES.has(phase))
            return fail(c, `phase "${phase}" is not allowed.`, 400)
        if (!runId) return fail(c, 'runId is required.', 400)

        const logChunk =
            rawLog.length > MAX_LOG_BYTES
                ? rawLog.slice(-MAX_LOG_BYTES)
                : rawLog

        await db.insert(clawInstallPhases).values({
            id: crypto.randomUUID(),
            clawId,
            installRunId: runId,
            phase,
            logChunk,
            createdAt: new Date()
        })

        // Mirror the active run onto the claws row. Cheap UPDATE that
        // makes "what's the current run for this claw?" answerable
        // without scanning claw_install_phases.
        await db
            .update(claws)
            .set({ installRunId: runId })
            .where(eq(claws.id, clawId))

        return ok(c, { ok: true, phase, runId }, '')
    }
)

export default postInstallPhase