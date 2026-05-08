import type { AuthenticatedContext } from '@/ts/Types'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users, authUsers } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'
import generateFunUsername from '@/controllers/users/helpers/generateFunUsername'

const getCurrentUser = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')

        const user = await db
            .select({
                id: users.id,
                email: authUsers.email,
                name: users.name,
                role: users.role,
                hasLicense: users.hasLicense,
                referralCode: users.referralCode,
                referralCodeChanged: users.referralCodeChanged,
                createdAt: users.createdAt
            })
            .from(users)
            .innerJoin(authUsers, eq(authUsers.id, users.id))
            .where(eq(users.id, userId))
            .limit(1)

        if (!user[0]) return fail(c, t('api.userNotFound'), 404)

        // Back-fill a friendly username on first profile fetch. The
        // public.users row is created by the auth-user trigger with
        // only `id` populated, so `name` is null until something
        // (this) writes to it. Doing the back-fill here means existing
        // accounts ALSO get a name on next dashboard load, not just
        // freshly-signed-up ones.
        if (!user[0].name) {
            const generated = generateFunUsername()
            await db
                .update(users)
                .set({ name: generated })
                .where(eq(users.id, userId))
            user[0].name = generated
        }

        return ok(c, user[0], t('api.profileFetched'))
    } catch (error) {
        console.error('getCurrentUser', error)
        return fail(
            c,
            error instanceof Error
                ? error.message
                : t('api.failedToGetProfile'),
            500
        )
    }
}

export default getCurrentUser