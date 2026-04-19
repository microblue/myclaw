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
import {
    getSystemSetting,
    SETTINGS_KEYS
} from '@/services/systemSettings'

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

        const [openrouterApiKey, defaultModel] = await Promise.all([
            getSystemSetting(SETTINGS_KEYS.defaultOpenrouterApiKey),
            getSystemSetting(SETTINGS_KEYS.defaultOpenrouterModel)
        ])

        const cloudInitScript = generateCloudInit(
            claw.rootPassword || '',
            claw.subdomain || '',
            DOMAIN,
            claw.gatewayToken || '',
            { openrouterApiKey, defaultModel }
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
        // assigned a provisional IP (Lightsail returns 0.0.0.0 until
        // the VPS is actually running). Status stays at 'creating'.
        //
        // DNS is deliberately NOT created here — server.ip would be
        // 0.0.0.0 on Lightsail and certbot's HTTP-01 challenge would
        // then fail. DNS creation moves into pollLifecycle once we
        // know the real IP.
        await db
            .update(claws)
            .set({
                providerServerId: server.serverId,
                ip: server.ip
            })
            .where(eq(claws.id, clawId))

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
    // As soon as we see a real IP (not Lightsail's 0.0.0.0 placeholder)
    // create the Cloudflare A record — doing this before the IP is
    // known left the DNS pointing at 0.0.0.0 after the VPS came up.
    let currentIp = ip
    let dnsCreated = false
    const stage1Deadline = Date.now() + PROVIDER_POLL_MAX_MS
    let providerRunning = false
    while (Date.now() < stage1Deadline && !providerRunning) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
        try {
            const live = await provider.getServer(serverId, locationId)
            if (live.ip && live.ip !== '0.0.0.0') currentIp = live.ip
            if (
                !dnsCreated &&
                subdomain &&
                currentIp &&
                currentIp !== '0.0.0.0'
            ) {
                dnsCreated = true
                await cloudflare
                    .createDNSRecord(subdomain, currentIp)
                    .catch((err) =>
                        console.error('[provisionClawServer] DNS', err)
                    )
            }
            if (live.status === clawStatus.running) {
                providerRunning = true
                await db
                    .update(claws)
                    .set({
                        status: clawStatus.configuring,
                        ip: currentIp
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

    // Stage 2: poll until the OpenClaw gateway — not just nginx — is
    // actually answering, end-to-end.
    //
    // The older check accepted any <500 response from http://{ip}/ with
    // a Host header, which let us flip to "running" while:
    //   - cloud-init was still installing nginx and the distro default
    //     welcome page returned 200,
    //   - nginx was up but openclaw-gateway was not (proxy_pass → 502,
    //     which is >500 but the prior redirect hop could have been 301
    //     <500), or
    //   - HTTPS was not actually working yet.
    //
    // New rules:
    //   - probe HTTPS on the public subdomain (forces cert + DNS + nginx
    //     + gateway to all be wired up),
    //   - require HTTP 200 (not 502 from upstream, not a redirect),
    //   - body must look like OpenClaw's Control UI, not nginx's
    //     "Welcome to nginx" default page,
    //   - require 3 consecutive successes so a brief gateway blip
    //     before a crash loop doesn't sell us out.
    const isOpenclawResponse = (body: string): boolean => {
        const lower = body.toLowerCase()
        if (lower.includes('welcome to nginx')) return false
        return (
            lower.includes('openclaw') ||
            lower.includes('control ui') ||
            lower.includes('gateway') ||
            body.trim().startsWith('{')
        )
    }

    const REQUIRED_CONSECUTIVE_OK = 3
    let consecutiveOk = 0
    const stage2Deadline = Date.now() + GATEWAY_POLL_MAX_MS
    while (Date.now() < stage2Deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
        try {
            const res = await fetch(
                `https://${subdomain}.${domain}/`,
                { signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS) }
            )
            const body = res.status === 200 ? await res.text() : ''
            if (res.status === 200 && isOpenclawResponse(body)) {
                consecutiveOk += 1
                if (consecutiveOk >= REQUIRED_CONSECUTIVE_OK) {
                    await db
                        .update(claws)
                        .set({ status: clawStatus.running })
                        .where(eq(claws.id, clawId))
                    return
                }
            } else {
                consecutiveOk = 0
            }
        } catch (_) {
            consecutiveOk = 0
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