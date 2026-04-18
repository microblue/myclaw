import type { ClawRow } from '@/ts/Types'
import type { ServerStatus } from '@/ts/Interfaces'

import { eq } from 'drizzle-orm'
import { clawStatus } from '@openclaw/shared'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { providerRegistry } from '@/services/providers'
import cloudflare from '@/services/cloudflare'
import checkSubdomainReady from '@/controllers/claws/helpers/checkSubdomainReady'

const transitionCompletedBy: Record<string, string[]> = {
    [clawStatus.stopping]: [clawStatus.stopped],
    [clawStatus.starting]: [clawStatus.running],
    [clawStatus.creating]: [clawStatus.running],
    [clawStatus.initializing]: [clawStatus.running],
    [clawStatus.migrating]: [clawStatus.running],
    [clawStatus.rebuilding]: [clawStatus.running],
    [clawStatus.restarting]: [clawStatus.running]
}

// If the Cloudflare DNS integration isn't configured the subdomain
// readiness check can never succeed, so we treat the provider's own
// "running" signal as enough to flip the claw to running. Without this
// dev/no-DNS deployments get stuck in configuring forever.
const CLOUDFLARE_DISABLED =
    !process.env.CLOUDFLARE_API_TOKEN ||
    process.env.CLOUDFLARE_API_TOKEN.startsWith('your_') ||
    !process.env.CLOUDFLARE_ZONE_ID

const syncClawServers = async (clawList: ClawRow[]): Promise<ClawRow[]> => {
    // Group claws by provider so we make one getServers() call per
    // registered provider instead of one-per-claw (and instead of the
    // legacy single-provider behaviour that ignored claw.provider).
    const byProvider = new Map<string, ClawRow[]>()
    for (const c of clawList) {
        const pid = c.provider || 'hetzner'
        const arr = byProvider.get(pid)
        if (arr) arr.push(c)
        else byProvider.set(pid, [c])
    }

    const serverMapsByProvider = new Map<string, Map<string, ServerStatus>>()
    await Promise.all(
        Array.from(byProvider.keys()).map(async (pid) => {
            const provider = providerRegistry.getProvider(pid)
            if (!provider) return
            try {
                const map = await provider.getServers()
                serverMapsByProvider.set(pid, map)
            } catch (error) {
                console.error(`syncClawServers ${pid}`, error)
            }
        })
    )

    const syncedClaws = await Promise.all(
        clawList.map(async (claw) => {
            if (!claw.providerServerId) return claw
            const pid = claw.provider || 'hetzner'
            const live = serverMapsByProvider.get(pid)?.get(
                claw.providerServerId
            )
            if (!live) return claw

            if (claw.status === clawStatus.configuring) {
                if (
                    live.ip &&
                    claw.subdomain &&
                    (!claw.ip || claw.ip !== live.ip)
                ) {
                    await Promise.all([
                        cloudflare
                            .findDNSRecord(claw.subdomain)
                            .then(async (existing) => {
                                if (existing && existing.ip !== live.ip) {
                                    await cloudflare.updateDNSRecord(
                                        existing.id,
                                        claw.subdomain!,
                                        live.ip!
                                    )
                                } else if (!existing) {
                                    await cloudflare.createDNSRecord(
                                        claw.subdomain!,
                                        live.ip!
                                    )
                                }
                            })
                            .catch((error) => {
                                console.error('syncClawServers', error)
                            }),
                        db
                            .update(claws)
                            .set({ ip: live.ip })
                            .where(eq(claws.id, claw.id))
                    ])
                }

                if (live.status === clawStatus.running && claw.subdomain) {
                    // Without working DNS the subdomain check always
                    // fails, so skip it and trust the provider's signal.
                    const ready = CLOUDFLARE_DISABLED
                        ? true
                        : await checkSubdomainReady(claw.subdomain)
                    if (ready) {
                        await db
                            .update(claws)
                            .set({
                                status: clawStatus.running,
                                ip: live.ip
                            })
                            .where(eq(claws.id, claw.id))
                        return {
                            ...claw,
                            status: clawStatus.running,
                            ip: live.ip
                        }
                    }
                }
                return { ...claw, ip: live.ip }
            }

            if (claw.status === clawStatus.unreachable)
                return { ...claw, ip: live.ip }

            const completionStates = transitionCompletedBy[claw.status]
            if (completionStates && !completionStates.includes(live.status)) {
                return { ...claw, ip: live.ip }
            }

            if (claw.status !== live.status) {
                await db
                    .update(claws)
                    .set({ status: live.status, ip: live.ip })
                    .where(eq(claws.id, claw.id))
            }

            return { ...claw, status: live.status, ip: live.ip }
        })
    )

    return syncedClaws
}

export default syncClawServers
