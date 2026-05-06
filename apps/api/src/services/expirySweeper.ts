import { runCleanupExpiredClaws } from '@/controllers/cron'

const HOURLY = 60 * 60 * 1000

let timer: ReturnType<typeof setInterval> | null = null

// Periodic in-process job that runs cleanupExpiredClaws hourly. The
// HTTP endpoint at GET /cron/cleanup-expired-claws still exists for
// manual invocation and external cron callers, but production no
// longer relies on something outside the API to keep firing it —
// subscription expiry now actually evicts the box.
//
// One hour is a conservative cadence: subscription windows are
// measured in days, so a worst-case extra hour of uptime past
// expiry is invisible to users and well below any meaningful
// hosting-cost noise. If a production sweep ever has to flip more
// than a handful of claws at once, prefer dropping cadence rather
// than batching — cleanupClaw makes provider-API calls that don't
// parallelize well past ~10x.
export default function startExpirySweeper(): void {
    if (timer) return
    void runCleanupExpiredClaws().catch((err) => {
        console.error('expirySweeper boot pass failed:', err)
    })
    timer = setInterval(() => {
        void runCleanupExpiredClaws().catch((err) => {
            console.error('expirySweeper periodic pass failed:', err)
        })
    }, HOURLY)
    timer.unref?.()
}