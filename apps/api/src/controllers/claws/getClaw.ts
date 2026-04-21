import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws, users } from '@/db/schema'
import { getProvider } from '@/services/provider'
import { sanitizeClaw, withClaw } from '@/controllers/claws/helpers'
import { ok } from '@/lib/response'
import { t } from '@openclaw/i18n'
import withErrorHandler from '@/lib/withErrorHandler'

// Admin viewers always get the owner email enriched — even for claws
// they own themselves — so the detail page can render the admin
// banner + "Change owner" action on every claw. The banner is how
// admins access the reassign flow, so hiding it for self-owned claws
// would just be an annoying gap. Non-admin callers are unaffected
// (ownerEmail stays undefined).
const attachOwnerEmail = async <T extends { userId: string }>(
    claw: T,
    isAdmin: boolean
): Promise<T & { ownerEmail?: string | null }> => {
    if (!isAdmin) return claw
    const [owner] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, claw.userId))
        .limit(1)
    return { ...claw, ownerEmail: owner?.email ?? null }
}

const getClaw = withErrorHandler('getClaw')(
    withClaw()(async (c, claw) => {
        const id = c.req.param('id')!
        const sync = c.req.query('sync') === 'true'
        const isAdmin = c.get('isAdmin')

        if (sync && claw.providerServerId) {
            try {
                const provider = getProvider()
                const serverStatus = await provider.getServer(
                    claw.providerServerId
                )
                if (
                    serverStatus.status !== claw.status ||
                    serverStatus.ip !== claw.ip
                ) {
                    await db
                        .update(claws)
                        .set({
                            status: serverStatus.status,
                            ip: serverStatus.ip
                        })
                        .where(eq(claws.id, id))
                    const enriched = await attachOwnerEmail(
                        sanitizeClaw({
                            ...claw,
                            status: serverStatus.status,
                            ip: serverStatus.ip
                        }),
                        isAdmin
                    )
                    return ok(c, enriched, t('api.clawFetched'))
                }
            } catch (error) {
                console.error('getClaw', error)
            }
        }

        const enriched = await attachOwnerEmail(sanitizeClaw(claw), isAdmin)
        return ok(c, enriched, t('api.clawFetched'))
    })
)

export default getClaw