import type {
    ProvisionClawParams,
    ProvisionClawResponse
} from '@/ts/Interfaces'

import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { clawStatus, inputValidation } from '@openclaw/shared'
import { db } from '@/db'
import { subscriptionStatus } from '@/lib/constants'
import { claws, pendingClaws, sshKeys, volumes } from '@/db/schema'
import { providerRegistry } from '@/services/providers'
import cloudflare from '@/services/cloudflare'
import {
    generateSlug,
    generateServerName,
    generateToken,
    generateCloudInit,
    DOMAIN
} from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'

const provisionClaw = async (
    params: ProvisionClawParams
): Promise<ProvisionClawResponse> => {
    try {
        const existingClaw = await db
            .select()
            .from(claws)
            .where(eq(claws.polarSubscriptionId, params.subscriptionId))
            .limit(1)

        if (existingClaw[0])
            return { success: true, clawId: existingClaw[0].id }

        const claimed = await db
            .delete(pendingClaws)
            .where(eq(pendingClaws.id, params.pendingClawId))
            .returning()

        if (!claimed[0])
            return { success: false, error: t('api.pendingClawNotFound') }

        const pending = claimed[0]

        // Get the provider instance based on pending claw's provider field
        const providerId = pending.provider || 'hetzner'
        const provider = providerRegistry.getProvider(providerId)
        
        if (!provider) {
            return { success: false, error: t('api.providerNotAvailable') }
        }

        const [serverPlans, sshKeyResult] = await Promise.all([
            provider.getPlans(),
            pending.sshKeyId
                ? db
                      .select()
                      .from(sshKeys)
                      .where(eq(sshKeys.id, pending.sshKeyId))
                      .limit(1)
                : Promise.resolve(null)
        ])

        const selectedPlan = serverPlans.find(
            (plan) => plan.id === pending.planId || plan.name === pending.planId
        )

        if (
            !selectedPlan ||
            selectedPlan.memory < inputValidation.MIN_MEMORY_GB.MIN
        )
            return { success: false, error: t('api.planBelowMinimumMemory') }

        const id = crypto.randomUUID()
        const subdomain = generateSlug(id)
        const gatewayToken = generateToken()

        let providerSshKeyIds: string[] | undefined
        if (sshKeyResult && sshKeyResult[0]) {
            if (sshKeyResult[0].providerKeyId) {
                providerSshKeyIds = [String(sshKeyResult[0].providerKeyId)]
            }
        }

        const cloudInitScript = generateCloudInit(
            pending.rootPassword || '',
            subdomain,
            DOMAIN,
            gatewayToken
        )

        await db.insert(claws).values({
            id,
            userId: pending.userId,
            name: pending.name,
            status: clawStatus.creating,
            planId: pending.planId,
            location: pending.location,
            provider: providerId,
            rootPassword: pending.rootPassword,
            sshKeyId: pending.sshKeyId,
            subdomain,
            gatewayToken,
            polarSubscriptionId: params.subscriptionId,
            polarProductId: params.productId,
            polarCustomerId: params.customerId,
            subscriptionStatus: subscriptionStatus.active,
            billingInterval: pending.billingInterval
        })

        let serverId: string
        let ip: string

        try {
            const serverName = generateServerName(pending.name, id)
            console.log("[provision] provider:", providerId, "planId:", pending.planId, "location:", pending.location)
        const server = await provider.createServer({
                name: serverName,
                planId: pending.planId,
                locationId: pending.location,
                rootPassword: pending.rootPassword || undefined,
                sshKeyIds: providerSshKeyIds,
                userData: cloudInitScript
            })
            serverId = server.serverId
            ip = server.ip
        } catch (providerErr) {
            await db.delete(claws).where(eq(claws.id, id))
            throw providerErr
        }

        await Promise.all([
            cloudflare
                .createDNSRecord(subdomain, ip)
                .catch((dnsError) => console.error('provisionClaw', dnsError)),
            db
                .update(claws)
                .set({
                    providerServerId: serverId,
                    status: clawStatus.configuring,
                    ip
                })
                .where(eq(claws.id, id))
        ])

        if (
            pending.volumeSize &&
            pending.volumeSize >= inputValidation.VOLUME_SIZE.MIN
        ) {
            try {
                // Check if provider supports volumes
                if (provider.createVolume) {
                    const volumeId = crypto.randomUUID()
                    const providerVolume = await provider.createVolume(
                        `${pending.name}-vol-${volumeId.slice(0, 8)}`,
                        pending.volumeSize,
                        pending.location,
                        serverId
                    )

                    await db.insert(volumes).values({
                        id: volumeId,
                        userId: pending.userId,
                        clawId: id,
                        name: `${pending.name}-storage`,
                        size: pending.volumeSize,
                        providerVolumeId: parseInt(providerVolume.id, 10),
                        location: pending.location,
                        status: 'available'
                    })
                } else {
                    console.warn(`provisionClaw: Provider ${providerId} does not support volumes`)
                }
            } catch (volumeError) {
                console.error('provisionClaw', volumeError)
            }
        }

        return { success: true, clawId: id, referralCode: pending.referralCode }
    } catch (error) {
        console.error('provisionClaw', error)
        return {
            success: false,
            error: t('api.failedToProvisionClaw')
        }
    }
}

export default provisionClaw