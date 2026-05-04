import type { AuthenticatedContext } from '@/ts/Types'

import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { activationCodes } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const voidActivationCode = withErrorHandler('voidActivationCode')(async (
    c: AuthenticatedContext
) => {
    const id = c.req.param('id')
    if (!id) return fail(c, 'id is required.', 400)

    const updated = await db
        .update(activationCodes)
        .set({ status: 'voided' })
        .where(
            and(
                eq(activationCodes.id, id),
                eq(activationCodes.status, 'unused')
            )
        )
        .returning({ id: activationCodes.id })

    if (updated.length === 0) {
        // Either the row doesn't exist, or it's already redeemed/voided —
        // surface a 400 in both cases since no further action is possible.
        const existing = await db
            .select({ status: activationCodes.status })
            .from(activationCodes)
            .where(eq(activationCodes.id, id))
            .limit(1)
            .then((rows) => rows[0])

        if (!existing) return fail(c, 'Activation code not found.', 404)
        return fail(
            c,
            `Cannot void code with status "${existing.status}".`,
            400
        )
    }

    return ok(c, { id, status: 'voided' }, 'Activation code voided.')
})

export default voidActivationCode