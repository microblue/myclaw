import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { clawStatus, inputValidation } from '@openclaw/shared'
import { db } from '@/db'
import { claws, sshKeys, volumes } from '@/db/schema'
import { providerRegistry } from '@/services/providers'
import cloudflare from '@/services/cloudflare'
import {
    generateServerName,
    generateCloudInit,
    DOMAIN
} from '@/controllers/claws/helpers'

// Background provisioning worker. Expects a `claws` row to already
// exist with status=creating and the rootPassword / sshKeyId / subdomain
// / gatewayToken fields populated. Calls the cloud provider, updates
// the row with the provisioned server id + IP, provisions DNS, and
// optionally creates a volume. On any error, marks the row as
// unreachable so the dashboard can surface a failed tile.
//
// Used by the dev-mode purchase flow which returns to the UI
// immediately; the real work happens here without the frontend
// waiting.

type ProvisionServerParams = {
    clawId: string
    volumeSize?: number | null
}

const provisionClawServer = async ({
    clawId,
    volumeSize
}: ProvisionServerParams): Promise<void> => {
    try {
        const [claw] = await db
            .select()
            .from(claws)
            .where(eq(claws.id, clawId))
            .limit(1)

        if (!claw) {
            console.error('[provisionClawServer] claw not found:', clawId)
            return
        }

        const providerId = claw.provider || 'hetzner'
        const provider = providerRegistry.getProvider(providerId)

        if (!provider) {
            await markError(clawId, 'provider unavailable')
            return
        }

        const [serverPlans, sshKeyResult] = await Promise.all([
            provider.getPlans(),
            claw.sshKeyId
                ? db
                      .select()
                      .from(sshKeys)
                      .where(eq(sshKeys.id, claw.sshKeyId))
                      .limit(1)
                : Promise.resolve(null)
        ])

        const selectedPlan = serverPlans.find(
            (plan) => plan.id === claw.planId || plan.name === claw.planId
        )

        if (
            !selectedPlan ||
            selectedPlan.memory < inputValidation.MIN_MEMORY_GB.MIN
        ) {
            await markError(clawId, 'plan below minimum memory')
            return
        }

        let providerSshKeyIds: string[] | undefined
        if (sshKeyResult && sshKeyResult[0]?.providerKeyId) {
            providerSshKeyIds = [String(sshKeyResult[0].providerKeyId)]
        }

        const cloudInitScript = generateCloudInit(
            claw.rootPassword || '',
            claw.subdomain || '',
            DOMAIN,
            claw.gatewayToken || ''
        )

        const serverName = generateServerName(claw.name, claw.id)

        const server = await provider.createServer({
            name: serverName,
            planId: claw.planId,
            locationId: claw.location || '',
            rootPassword: claw.rootPassword || undefined,
            sshKeyIds: providerSshKeyIds,
            userData: cloudInitScript
        })

        // Stage 1 of the lifecycle: provider accepted the request and
        // assigned an IP. Status stays at 'creating' (= "Launching
        // instance") until the provider reports the VPS is running.
        // Note: we do NOT flip to configuring yet — configuring means
        // "the VPS is booted, cloud-init is running OpenClaw install".
        await Promise.all([
            claw.subdomain
                ? cloudflare
                      .createDNSRecord(claw.subdomain, server.ip)
                      .catch((err) =>
                          console.error('[provisionClawServer] DNS', err)
                      )
                : Promise.resolve(),
            db
                .update(claws)
                .set({
                    providerServerId: server.serverId,
                    ip: server.ip
                })
                .where(eq(claws.id, clawId))
        ])

        void pollLifecycle({
            provider,
            clawId,
            serverId: server.serverId,
            locationId: claw.location || undefined,
            ip: server.ip,
            subdomain: claw.subdomain || '',
            domain: DOMAIN
        })

        if (
            volumeSize &&
            volumeSize >= inputValidation.VOLUME_SIZE.MIN &&
            provider.createVolume
        ) {
            try {
                const volumeId = crypto.randomUUID()
                const providerVolume = await provider.createVolume(
                    `${claw.name}-vol-${volumeId.slice(0, 8)}`,
                    volumeSize,
                    claw.location || '',
                    server.serverId
                )

                await db.insert(volumes).values({
                    id: volumeId,
                    userId: claw.userId,
                    clawId,
                    name: `${claw.name}-storage`,
                    size: volumeSize,
                    providerVolumeId: parseInt(providerVolume.id, 10),
                    location: claw.location || '',
                    status: 'available'
                })
            } catch (err) {
                console.error('[provisionClawServer] volume', err)
            }
        }
    } catch (err) {
        console.error('[provisionClawServer]', err)
        await markError(clawId, err instanceof Error ? err.message : 'failed')
    }
}

// Two-stage provisioning poll:
//   Stage 1  creating    -> configuring : provider reports VPS running
//                                         (VPS is up, cloud-init can start)
//   Stage 2  configuring -> running     : OpenClaw gateway answers HTTP
//                                         via the nginx proxy
// So the dashboard's label reflects the actual step:
//   "Launching instance…"  (creating)
//   "Deploying Claw…"      (configuring)
//   "Running"              (running)
const POLL_INTERVAL_MS = 5_000
const PROVIDER_POLL_MAX_MS = 5 * 60 * 1000
const GATEWAY_POLL_MAX_MS = 6 * 60 * 1000
const GATEWAY_TIMEOUT_MS = 3_000

const pollLifecycle = async ({
    provider,
    clawId,
    serverId,
    locationId,
    ip,
    subdomain,
    domain
}: {
    provider: NonNullable<ReturnType<typeof providerRegistry.getProvider>>
    clawId: string
    serverId: string
    locationId?: string
    ip: string
    subdomain: string
    domain: string
}): Promise<void> => {
    // Stage 1: wait for the provider to report running, flip to
    // configuring so the UI changes from "Launching" to "Deploying".
    let currentIp = ip
    const stage1Deadline = Date.now() + PROVIDER_POLL_MAX_MS
    let providerRunning = false
    while (Date.now() < stage1Deadline && !providerRunning) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
        try {
            const live = await provider.getServer(serverId, locationId)
            if (live.ip) currentIp = live.ip
            if (live.status === clawStatus.running) {
                providerRunning = true
                await db
                    .update(claws)
                    .set({
                        status: clawStatus.configuring,
                        ip: live.ip || undefined
                    })
                    .where(eq(claws.id, clawId))
            }
        } catch (err) {
            console.error('[provisionClawServer] provider-poll', err)
        }
    }
    if (!providerRunning) {
        console.warn(
            `[provisionClawServer] provider never went running for ${clawId}`
        )
        return
    }

    // Stage 2: poll the OpenClaw gateway (via nginx) until it answers.
    // We hit http://{ip}/ with a Host header for the claw's subdomain
    // so this works even before Cloudflare DNS propagates to the new
    // A record. Any < 500 response means nginx + gateway are up.
    const stage2Deadline = Date.now() + GATEWAY_POLL_MAX_MS
    while (Date.now() < stage2Deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
        try {
            const res = await fetch(`http://${currentIp}/`, {
                headers: subdomain ? { Host: `${subdomain}.${domain}` } : {},
                signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS)
            })
            if (res.status < 500) {
                await db
                    .update(claws)
                    .set({ status: clawStatus.running })
                    .where(eq(claws.id, clawId))
                return
            }
        } catch (_) {
            /* gateway not up yet, keep polling */
        }
    }
    console.warn(
        `[provisionClawServer] gateway never answered for ${clawId}; dashboard sync loop will continue trying`
    )
}

const markError = async (clawId: string, reason: string) => {
    console.error(`[provisionClawServer] ${clawId}: ${reason}`)
    try {
        await db
            .update(claws)
            .set({ status: clawStatus.unreachable })
            .where(eq(claws.id, clawId))
    } catch (err) {
        console.error('[provisionClawServer] failed to mark error', err)
    }
}

export default provisionClawServer