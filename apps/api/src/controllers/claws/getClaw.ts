import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws, users } from '@/db/schema'
import { getProvider } from '@/services/provider'
import { sanitizeClaw, withClaw } from '@/controllers/claws/helpers'
import { ok } from '@/lib/response'
import { t } from '@openclaw/i18n'
import withErrorHandler from '@/lib/withErrorHandler'

// When an admin is viewing another user's claw we surface the owner
// email to the client so the detail page can render a clear "admin
// view of <email>" banner. Non-admin callers always see their own
// claws, so the banner stays hidden (field is null/undefined) for
// them — consistent with how getAdminClaws already works.
const attachOwnerEmail = async <T extends { userId: string }>(
    claw: T,
    isAdmin: boolean,
    viewerUserId: string
): Promise<T & { ownerEmail?: string | null }> => {
    if (!isAdmin || claw.userId === viewerUserId) return claw
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
        const viewerUserId = c.get('userId')
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
                        isAdmin,
                        viewerUserId
                    )
                    return ok(c, enriched, t('api.clawFetched'))
                }
            } catch (error) {
                console.error('getClaw', error)
            }
        }

        const enriched = await attachOwnerEmail(
            sanitizeClaw(claw),
            isAdmin,
            viewerUserId
        )
        return ok(c, enriched, t('api.clawFetched'))
    })
)

export default getClaw