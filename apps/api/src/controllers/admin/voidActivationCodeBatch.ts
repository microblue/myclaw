import type { AuthenticatedContext } from '@/ts/Types'

import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { activationCodes } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

// Bulk-void every unused code in a batch. Already-redeemed codes are
// untouched (a redemption can't be reversed) and already-voided codes
// are no-ops. Idempotent — running twice voids no extra rows the
// second time.
const voidActivationCodeBatch = withErrorHandler(
    'voidActivationCodeBatch'
)(async (c: AuthenticatedContext) => {
    const batchId = c.req.param('batchId')
    if (!batchId) return fail(c, 'batchId is required.', 400)

    const updated = await db
        .update(activationCodes)
        .set({ status: 'voided' })
        .where(
            and(
                eq(activationCodes.batchId, batchId),
                eq(activationCodes.status, 'unused')
            )
        )
        .returning({ id: activationCodes.id })

    return ok(
        c,
        { batchId, voided: updated.length },
        `${updated.length} unused code${updated.length === 1 ? '' : 's'} voided.`
    )
})

export default voidActivationCodeBatch