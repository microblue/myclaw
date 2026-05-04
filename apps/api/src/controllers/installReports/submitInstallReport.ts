import type { Context } from 'hono'

import crypto from 'crypto'
import { db } from '@/db'
import { installReports } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import {
    getClientIp,
    checkRateLimit,
    setRateLimit
} from '@/controllers/auth/rateLimit'
import withErrorHandler from '@/lib/withErrorHandler'

// One report per IP per minute. Errors during install are usually one-shot
// — anyone hitting more often is either a developer hammering this in dev
// (acceptable) or abuse (rate-limit deflects).
const RATE_LIMIT_WINDOW = 60_000

// Hard caps to keep a report below ~1 MB (matches app.ts bodyLimit). The
// installer normally sends well under 100 KB; these guards keep a runaway
// log file from filling our table.
const MAX_LOG_BYTES = 256 * 1024
const MAX_STACK_BYTES = 16 * 1024
const MAX_FIELD_BYTES = 1024

// Phases the desktop bootstrap state machine can report. Anything else is
// rejected to keep this column queryable.
const VALID_PHASES = new Set([
    'idle',
    'detecting',
    'preparing',
    'installing',
    'starting-gateway',
    'ready',
    'error'
])

interface InstallReportBody {
    installId?: string
    desktopVersion?: string
    platform?: string
    arch?: string
    osRelease?: string
    nodeVersion?: string
    hostname?: string
    username?: string
    bootstrapPhase?: string
    error?: { message?: string; stack?: string | null }
    logs?: string[] | string
    envInfo?: Record<string, unknown>
}

const truncate = (value: string | null | undefined, max: number): string => {
    if (!value) return ''
    return value.length > max ? value.slice(0, max) : value
}

const submitInstallReport = withErrorHandler(
    'submitInstallReport',
    'api.internalServerError'
)(async (c: Context) => {
    const ip = getClientIp(c)
    if (ip) {
        const retryAfter = await checkRateLimit(
            `install-reports:ip:${ip}`,
            RATE_LIMIT_WINDOW
        )
        if (retryAfter > 0) {
            return fail(
                c,
                `Too many reports from this IP. Retry in ${retryAfter}s.`,
                429
            )
        }
    }

    const body = await c.req.json<InstallReportBody>().catch(() => null)
    if (!body) return fail(c, 'Invalid JSON body.', 400)

    const required: Array<keyof InstallReportBody> = [
        'installId',
        'desktopVersion',
        'platform',
        'arch',
        'osRelease',
        'nodeVersion',
        'hostname',
        'username',
        'bootstrapPhase'
    ]
    for (const key of required) {
        const v = body[key]
        if (typeof v !== 'string' || v.length === 0) {
            return fail(c, `Missing or invalid field: ${key}`, 400)
        }
    }

    if (!VALID_PHASES.has(body.bootstrapPhase!)) {
        return fail(c, `Invalid bootstrapPhase: ${body.bootstrapPhase}`, 400)
    }
    if (!body.error || typeof body.error.message !== 'string') {
        return fail(c, 'Missing error.message', 400)
    }

    // Logs: accept array of lines or a single string; normalize to one string
    // joined with newlines for storage.
    const logsRaw = Array.isArray(body.logs)
        ? body.logs.join('\n')
        : typeof body.logs === 'string'
          ? body.logs
          : ''

    const id = crypto.randomUUID()
    await db.insert(installReports).values({
        id,
        installId: truncate(body.installId, MAX_FIELD_BYTES),
        desktopVersion: truncate(body.desktopVersion, MAX_FIELD_BYTES),
        platform: truncate(body.platform, MAX_FIELD_BYTES),
        arch: truncate(body.arch, MAX_FIELD_BYTES),
        osRelease: truncate(body.osRelease, MAX_FIELD_BYTES),
        nodeVersion: truncate(body.nodeVersion, MAX_FIELD_BYTES),
        hostname: truncate(body.hostname, MAX_FIELD_BYTES),
        username: truncate(body.username, MAX_FIELD_BYTES),
        bootstrapPhase: body.bootstrapPhase!,
        errorMessage: truncate(body.error.message, MAX_FIELD_BYTES),
        errorStack: truncate(body.error.stack ?? '', MAX_STACK_BYTES) || null,
        logs: truncate(logsRaw, MAX_LOG_BYTES),
        envInfo: body.envInfo && typeof body.envInfo === 'object' ? body.envInfo : {},
        ip,
        userAgent: c.req.header('user-agent') ?? null
    })

    if (ip) await setRateLimit(`install-reports:ip:${ip}`)
    return ok(c, { reportId: id }, 'Install report received.', 201)
})

export default submitInstallReport