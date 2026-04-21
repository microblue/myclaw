import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { clawStatus, inputValidation } from '@openclaw/shared'
import { db } from '@/db'
import { claws, sshKeys, volumes } from '@/db/schema'
import { providerRegistry } from '@/services/providers'
import cloudflare from '@/services/cloudflare'
import {
    generateServerName,
    DOMAIN
} from '@/controllers/claws/helpers'
import { getClawRuntime, DEFAULT_CLAW_TYPE } from '@/services/clawRuntimes'
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

        // Memory floor comes from the claw runtime (OpenClaw=4, PicoClaw=0)
        // so PicoClaw can legitimately boot on Lightsail's 512 MB nano
        // while OpenClaw still gets the defensive 4 GB check.
        const memFloor =
            getClawRuntime(claw.clawType || DEFAULT_CLAW_TYPE)?.minMemoryGb ??
            inputValidation.MIN_MEMORY_GB.MIN
        if (!selectedPlan || selectedPlan.memory < memFloor) {
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

        // Dispatch to the per-type cloud-init through the runtime
        // registry. Fall back to the default (OpenClaw) on unknown
        // values so an older claw row without claw_type still boots
        // correctly.
        const runtime =
            getClawRuntime(claw.clawType || DEFAULT_CLAW_TYPE) ||
            getClawRuntime(DEFAULT_CLAW_TYPE)!
        const cloudInitScript = runtime.generateCloudInit({
            rootPassword: claw.rootPassword || '',
            subdomain: claw.subdomain || '',
            domain: DOMAIN,
            gatewayToken: claw.gatewayToken || '',
            llm: { openrouterApiKey, defaultModel }
        })

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
            domain: DOMAIN,
            clawType: claw.clawType || DEFAULT_CLAW_TYPE
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
// 2s poll interval + 2 consecutive OK floor ≈ 4s best-case flip to
// running once the claw's gateway is answering. Was 5s × 3 → 15s+
// best case, and in practice a DNS / cert-handshake blip reset the
// counter, leaving rusty-ember at 4m15s in configuring after bootstrap
// had actually finished (2026-04-21). 2s is tight enough to feel
// instant, loose enough for 2 OKs to still verify the claw isn't
// flapping.
const POLL_INTERVAL_MS = 2_000
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
    domain,
    clawType
}: {
    provider: NonNullable<ReturnType<typeof providerRegistry.getProvider>>
    clawId: string
    serverId: string
    locationId?: string
    ip: string
    subdomain: string
    domain: string
    clawType: string
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
                // syncClawServers' self-heal path may have already
                // written the record before we got here. Look first;
                // only create if missing, update if stale. Previously
                // we called create() blind, and Cloudflare error 81058
                // ("identical record already exists") bubbled all the
                // way out — leaving dnsCreated=false and the poll loop
                // spamming the same error for 5 minutes (see
                // happy-raven incident 2026-04-21).
                try {
                    const existing = await cloudflare.findDNSRecord(subdomain)
                    if (!existing) {
                        await cloudflare.createDNSRecord(subdomain, currentIp)
                    } else if (existing.ip !== currentIp) {
                        await cloudflare.updateDNSRecord(
                            existing.id,
                            subdomain,
                            currentIp
                        )
                    }
                    dnsCreated = true
                } catch (err) {
                    console.error(
                        `[provisionClawServer] DNS sync exhausted retries for ${subdomain}`,
                        err
                    )
                }
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

    // Stage 2: poll until the claw's gateway — not just nginx — is
    // actually answering, end-to-end. The runtime owns the "is this
    // response healthy?" predicate: OpenClaw wants a 200 that looks
    // like the Control UI, PicoClaw's launcher 302s to
    // /launcher-login which is still a "up and serving" signal.
    const runtime =
        getClawRuntime(clawType || DEFAULT_CLAW_TYPE) ||
        getClawRuntime(DEFAULT_CLAW_TYPE)!
    const isHealthy = runtime.isHealthyResponse

    const REQUIRED_CONSECUTIVE_OK = 2
    let consecutiveOk = 0
    const stage2Deadline = Date.now() + GATEWAY_POLL_MAX_MS
    while (Date.now() < stage2Deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
        try {
            const res = await fetch(`https://${subdomain}.${domain}/`, {
                signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
                redirect: 'manual'
            })
            // Read a bounded body slice so predicates can fingerprint
            // without us stalling on giant SPA payloads.
            const body = await res
                .text()
                .then((t) => t.slice(0, 4096))
                .catch(() => '')
            if (isHealthy(res.status, body)) {
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