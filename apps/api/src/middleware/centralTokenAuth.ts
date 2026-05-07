import type { Context, Next } from 'hono'
import { timingSafeEqual } from 'crypto'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { fail } from '@/lib/response'

// Verifies that the inbound Authorization: Bearer matches the targeted
// claw's `central_token`. Used by the /install/:clawId/phase endpoint
// (P2b) and any future claw → central call sites (outline push, last-
// message preview push). Per docs/aios-design.md §4.4 this token is
// distinct from gateway_token (inbound) so they can rotate
// independently.
//
// Constant-time comparison via crypto.timingSafeEqual; both buffers
// must be the same length, otherwise we early-reject (which is itself
// a length-leak, but knowing the length of an opaque ULID-like token
// gives an attacker no measurable advantage).
const centralTokenAuth = async (c: Context, next: Next) => {
    const clawId = c.req.param('clawId')
    if (!clawId) return fail(c, 'clawId required.', 401)

    const header = c.req.header('Authorization')
    if (!header?.startsWith('Bearer ')) {
        return fail(c, 'Authorization required.', 401)
    }
    const presented = header.slice(7)
    if (!presented) return fail(c, 'Authorization required.', 401)

    const row = await db
        .select({ centralToken: claws.centralToken })
        .from(claws)
        .where(eq(claws.id, clawId))
        .limit(1)
        .then((rows) => rows[0])

    if (!row || !row.centralToken) {
        return fail(c, 'Unauthorized.', 401)
    }

    const a = Buffer.from(presented, 'utf8')
    const b = Buffer.from(row.centralToken, 'utf8')
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return fail(c, 'Unauthorized.', 401)
    }

    return next()
}

export default centralTokenAuth