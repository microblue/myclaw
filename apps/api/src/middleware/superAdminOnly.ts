import type { AuthenticatedContext } from '@/ts/Types'
import type { Next } from 'hono'

import { userRole } from '@openclaw/shared'
import { fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

// Role-aware successor to the boolean-flagged `adminOnly`. Only the
// `userRole.admin` (= super-admin per docs/aios-design.md §2) gets
// through. Partners and end-users get 403. Reads from `c.get('userRole')`
// which is populated by the auth middleware after JWT verification.
const superAdminOnly = async (c: AuthenticatedContext, next: Next) => {
    if (c.get('userRole') !== userRole.admin) {
        return fail(c, t('api.adminAccessDenied'), 403)
    }
    return next()
}

export default superAdminOnly