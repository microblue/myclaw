import { ne, and, isNotNull, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { clawStatus } from '@openclaw/shared'
import cloudflare from '@/services/cloudflare'
import DOMAIN from '@/controllers/claws/helpers/constants'

// Periodic reconcile between the `claws` table and Cloudflare A
// records. Catches three drift modes the happy-path provisioner can
// miss:
//
//   1. Missing — DB has a claw with IP + subdomain, no Cloudflare
//      record (provisioner crashed mid-DNS call, all retries lost,
//      API deploy restart killed the async call, etc.). Fix: create.
//   2. Wrong IP — record points at an old IP (claw was rebuilt /
//      the provider assigned a new public IP). Fix: update.
//   3. Orphan — Cloudflare has an A record under DOMAIN whose
//      subdomain isn't in the live claws table (deleted claw whose
//      cleanupClaw silently skipped DNS delete, legacy records from
//      before the rebrand, etc.). Fix: delete.
//
// The apex record (`myclaw.one` itself, zone-level A to the landing
// page) is always preserved.

const RECONCILE_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

// Any status that indicates the claw should continue to exist (and
// therefore keep its DNS). Excludes `deleting` and `unreachable`.
const ACTIVE_STATUSES = [
    clawStatus.creating,
    clawStatus.configuring,
    clawStatus.initializing,
    clawStatus.running,
    clawStatus.starting,
    clawStatus.stopped,
    clawStatus.stopping,
    clawStatus.restarting,
    clawStatus.rebuilding,
    clawStatus.migrating,
    clawStatus.unknown
] as const

const reconcileDns = async (): Promise<void> => {
    const started = Date.now()
    let created = 0
    let updated = 0
    let deleted = 0
    let failed = 0

    try {
        const liveClaws = await db
            .select({
                id: claws.id,
                subdomain: claws.subdomain,
                ip: claws.ip,
                status: claws.status
            })
            .from(claws)
            .where(
                and(
                    isNotNull(claws.subdomain),
                    isNotNull(claws.ip),
                    ne(claws.ip, '0.0.0.0'),
                    inArray(claws.status, [...ACTIVE_STATUSES])
                )
            )

        const bySubdomain = new Map(
            liveClaws
                .filter((c): c is typeof c & { subdomain: string; ip: string } =>
                    Boolean(c.subdomain && c.ip)
                )
                .map((c) => [c.subdomain, c.ip])
        )

        const allRecords = await cloudflare.listAllDNSRecords()

        const byName = new Map(
            allRecords.map((r) => [r.name, r] as const)
        )

        // 1+2. Ensure every live claw has a matching record.
        for (const [subdomain, ip] of bySubdomain) {
            const fullName = `${subdomain}.${DOMAIN}`
            const existing = byName.get(fullName)
            try {
                if (!existing) {
                    await cloudflare.createDNSRecord(subdomain, ip)
                    created += 1
                    console.log(
                        `[dnsReconciler] created ${fullName} → ${ip}`
                    )
                } else if (existing.content !== ip) {
                    await cloudflare.updateDNSRecord(
                        existing.id,
                        subdomain,
                        ip
                    )
                    updated += 1
                    console.log(
                        `[dnsReconciler] updated ${fullName}: ${existing.content} → ${ip}`
                    )
                }
            } catch (err) {
                failed += 1
                console.error(
                    `[dnsReconciler] failed to reconcile ${fullName}`,
                    err
                )
            }
        }

        // 3. Orphans. Gated by `DNS_RECONCILER_DELETE_ORPHANS=1` —
        // the reconciler's first pass on a production zone will see
        // every pre-rebrand / manually-created record as an orphan,
        // so we default to logging only. Set the env var once you've
        // eyeballed the log and confirmed the delete list is safe.
        const deleteOrphans = process.env.DNS_RECONCILER_DELETE_ORPHANS === '1'
        const liveNames = new Set(
            [...bySubdomain.keys()].map((s) => `${s}.${DOMAIN}`)
        )
        for (const rec of allRecords) {
            if (rec.name === DOMAIN) continue // apex (landing page)
            if (!rec.name.endsWith(`.${DOMAIN}`)) continue // foreign zone
            if (liveNames.has(rec.name)) continue // matched above
            if (!deleteOrphans) {
                console.log(
                    `[dnsReconciler] orphan (dry-run) ${rec.name} → ${rec.content} — set DNS_RECONCILER_DELETE_ORPHANS=1 to delete`
                )
                continue
            }
            try {
                await cloudflare.deleteDNSRecord(rec.id)
                deleted += 1
                console.log(
                    `[dnsReconciler] deleted orphan ${rec.name} (was → ${rec.content})`
                )
            } catch (err) {
                failed += 1
                console.error(
                    `[dnsReconciler] failed to delete orphan ${rec.name}`,
                    err
                )
            }
        }

        const ms = Date.now() - started
        if (created || updated || deleted || failed) {
            console.log(
                `[dnsReconciler] pass done in ${ms}ms — created=${created} updated=${updated} deleted=${deleted} failed=${failed} (live=${bySubdomain.size}, cf=${allRecords.length})`
            )
        }
    } catch (err) {
        console.error('[dnsReconciler] pass aborted', err)
    }
}

let timer: ReturnType<typeof setInterval> | null = null

const startDnsReconciler = (): void => {
    if (timer) return
    // First pass runs a few seconds after boot so any missing records
    // from a recent provision get patched up before the next hour.
    setTimeout(() => {
        void reconcileDns()
    }, 30_000)
    timer = setInterval(() => {
        void reconcileDns()
    }, RECONCILE_INTERVAL_MS)
}

export { reconcileDns, startDnsReconciler }
export default startDnsReconciler