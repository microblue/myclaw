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
                    status: clawStatus.configuring,
                    ip: server.ip
                })
                .where(eq(claws.id, clawId))
        ])

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