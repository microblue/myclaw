import type { ClawCleanupData } from '@/ts/Interfaces'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws, volumes } from '@/db/schema'
import { providerRegistry } from '@/services/providers'
import cloudflare from '@/services/cloudflare'

// Route cleanup to the claw's own cloud provider. The legacy
// single-provider getProvider() was hard-wired to Hetzner, so Lightsail
// / DigitalOcean deletes silently no-op'd.

type CleanupOptions = ClawCleanupData & {
    provider?: string | null
    location?: string | null
}

const cleanupClaw = async (
    clawId: string,
    claw: CleanupOptions
): Promise<void> => {
    const providerId = claw.provider || 'hetzner'
    const provider = providerRegistry.getProvider(providerId)

    if (!provider) {
        console.error(
            `cleanupClaw: provider ${providerId} unavailable for ${clawId}`
        )
    }

    const clawVolumes = await db
        .select()
        .from(volumes)
        .where(eq(volumes.clawId, clawId))

    await Promise.allSettled([
        ...clawVolumes
            .filter((vol) => vol.providerVolumeId)
            .map(async (vol) => {
                if (!provider?.detachVolume || !provider?.deleteVolume) return
                try {
                    await provider.detachVolume(String(vol.providerVolumeId))
                    await provider.deleteVolume(String(vol.providerVolumeId))
                } catch (err) {
                    console.error('cleanupClaw volume', err)
                }
            }),
        claw.subdomain
            ? cloudflare
                  .findDNSRecord(claw.subdomain)
                  .then((rec) =>
                      rec ? cloudflare.deleteDNSRecord(rec.id) : null
                  )
                  .catch((err) => console.error('cleanupClaw dns', err))
            : Promise.resolve(),
        claw.providerServerId && provider
            ? provider
                  .deleteServer(
                      claw.providerServerId,
                      claw.location || undefined
                  )
                  .catch((err) =>
                      console.error('cleanupClaw deleteServer', err)
                  )
            : Promise.resolve()
    ])

    await db.delete(claws).where(eq(claws.id, clawId))
}

export default cleanupClaw
