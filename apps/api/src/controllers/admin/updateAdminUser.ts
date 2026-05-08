import type { AuthenticatedContext } from '@/ts/Types'
import type { AdminUpdateFields } from '@/ts/Interfaces'

import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { userRole } from '@openclaw/shared'
import { db } from '@/db'
import { users, auditLog } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'
import withErrorHandler from '@/lib/withErrorHandler'

const ALLOWED_ROLES: ReadonlyArray<string> = [
    userRole.user,
    userRole.admin,
    userRole.partner
]

const updateAdminUser = withErrorHandler(
    'updateAdminUser',
    'api.failedToUpdateAdminUser'
)(async (c: AuthenticatedContext) => {
    const userId = c.req.param('id')
    if (!userId) return fail(c, t('api.userNotFound'), 404)

    const body = await c.req.json()
    const { name, referralCode, role } = body

    const existing = await db
        .select({
            id: users.id,
            role: users.role
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

    if (!existing[0]) return fail(c, t('api.userNotFound'), 404)

    const updates: AdminUpdateFields = {}
    if (name !== undefined) updates.name = name || null
    if (referralCode !== undefined) updates.referralCode = referralCode || null

    // Role change: validate the value is one of the canonical three,
    // forbid an admin from demoting themselves (catches a foot-gun
    // where the lone admin could lock the platform out of admin
    // access), and emit an audit_log row so role changes are traceable.
    let roleChanged = false
    let beforeRole: string | null = null
    if (role !== undefined && role !== existing[0].role) {
        if (!ALLOWED_ROLES.includes(role)) {
            return fail(c, `Invalid role "${role}".`, 400)
        }
        const actorId = c.get('userId')
        if (
            actorId === userId &&
            existing[0].role === userRole.admin &&
            role !== userRole.admin
        ) {
            return fail(
                c,
                'You cannot demote yourself from admin. Ask another admin.',
                400
            )
        }
        updates.role = role
        roleChanged = true
        beforeRole = existing[0].role
    }

    await db.transaction(async (tx) => {
        if (Object.keys(updates).length > 0) {
            await tx.update(users).set(updates).where(eq(users.id, userId))
        }
        if (roleChanged) {
            await tx.insert(auditLog).values({
                id: crypto.randomUUID(),
                actorId: c.get('userId'),
                actorRole: 'admin',
                action: 'user_role_change',
                targetKind: 'user',
                targetId: userId,
                beforeValue: { role: beforeRole },
                afterValue: { role },
                createdAt: new Date()
            })
        }
    })

    return ok(c, null, t('api.adminUserUpdated'))
})

export default updateAdminUser