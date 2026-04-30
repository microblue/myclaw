import type { AuthenticatedContext } from '@/ts/Types'

import { findUserClaw } from '@/controllers/claws/helpers'
import { DOMAIN } from '@/controllers/claws/helpers'
import parseNodeExporter, {
    computeCpuUsage
} from '@/controllers/claws/helpers/parseNodeExporter'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

// 1s gap between the two cumulative-counter samples is the smallest
// node_exporter window with a non-zero busy delta on an idle box.
// Stretching it lengthens api latency without improving precision.
const SAMPLE_GAP_MS = 1000

// 4s per fetch — a stuck claw or a TCP black-hole shouldn't park the
// api request for the default 30s. Web polls every 5s; total worst
// case for one cycle is ~10s (4s + 1s gap + 4s).
const FETCH_TIMEOUT_MS = 4000

type UnavailableReason =
    | 'claw_not_provisioned'
    | 'metrics_endpoint_unreachable'
    | 'metrics_unauthorized'
    | 'metrics_parse_error'

const fetchSample = async (
    url: string,
    token: string
): Promise<{ ok: true; text: string } | { ok: false; reason: UnavailableReason }> => {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS)
    try {
        const res = await fetch(url, {
            headers: { authorization: `Bearer ${token}` },
            signal: ac.signal
        })
        if (res.status === 401) return { ok: false, reason: 'metrics_unauthorized' }
        // 404 (old claw without /metrics location) and any 5xx fall
        // through to the same "endpoint unreachable" bucket — the
        // user-facing tile shows "metrics unavailable" either way.
        if (!res.ok) return { ok: false, reason: 'metrics_endpoint_unreachable' }
        return { ok: true, text: await res.text() }
    } catch (_) {
        return { ok: false, reason: 'metrics_endpoint_unreachable' }
    } finally {
        clearTimeout(timer)
    }
}

const getClawMetrics = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const claw = await findUserClaw(userId, id, c.get('isAdmin'))

        if (!claw) return fail(c, t('api.clawNotFound'), 404)

        if (!claw.subdomain || !claw.gatewayToken) {
            return ok(
                c,
                {
                    available: false as const,
                    reason: 'claw_not_provisioned' as const
                },
                t('api.metricsFetched')
            )
        }

        const url = `https://${claw.subdomain}.${DOMAIN}/metrics`
        const first = await fetchSample(url, claw.gatewayToken)
        if (!first.ok) {
            return ok(
                c,
                { available: false as const, reason: first.reason },
                t('api.metricsFetched')
            )
        }
        await new Promise((r) => setTimeout(r, SAMPLE_GAP_MS))
        const second = await fetchSample(url, claw.gatewayToken)
        if (!second.ok) {
            return ok(
                c,
                { available: false as const, reason: second.reason },
                t('api.metricsFetched')
            )
        }

        let earlier
        let later
        try {
            earlier = parseNodeExporter(first.text)
            later = parseNodeExporter(second.text)
        } catch (_) {
            return ok(
                c,
                {
                    available: false as const,
                    reason: 'metrics_parse_error' as const
                },
                t('api.metricsFetched')
            )
        }

        const cpu = computeCpuUsage(earlier, later)
        const memory = {
            totalBytes: later.memory.totalBytes,
            availableBytes: later.memory.availableBytes,
            usedBytes: Math.max(
                0,
                later.memory.totalBytes - later.memory.availableBytes
            ),
            usedPct:
                later.memory.totalBytes > 0
                    ? ((later.memory.totalBytes - later.memory.availableBytes) /
                          later.memory.totalBytes) *
                      100
                    : 0
        }
        const disk = {
            mountpoint: later.disk.mountpoint,
            totalBytes: later.disk.totalBytes,
            availableBytes: later.disk.availableBytes,
            usedBytes: Math.max(
                0,
                later.disk.totalBytes - later.disk.availableBytes
            ),
            usedPct:
                later.disk.totalBytes > 0
                    ? ((later.disk.totalBytes - later.disk.availableBytes) /
                          later.disk.totalBytes) *
                      100
                    : 0
        }

        return ok(
            c,
            {
                available: true as const,
                sampledAt: new Date().toISOString(),
                cpu: {
                    usagePct: cpu.usagePct,
                    cores: cpu.cores
                },
                memory,
                disk,
                loadAvg: later.loadAvg
            },
            t('api.metricsFetched')
        )
    } catch (error) {
        console.error('getClawMetrics', error)
        return fail(
            c,
            error instanceof Error
                ? error.message
                : t('api.failedToGetMetrics'),
            500
        )
    }
}

export default getClawMetrics