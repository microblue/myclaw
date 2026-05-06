import type { AuthenticatedContext } from '@/ts/Types'
import type { Next } from 'hono'

import { userRole } from '@openclaw/shared'
import { fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

// Gate that allows both `userRole.admin` (super-admin) and
// `userRole.partner` (channel partner) through. The downstream
// controller is responsible for SCOPING — partner sees only own
// rows, admin sees all. End-users and anonymous callers get 403.
//
// Used by routes such as /api/admin/codes/mint and the partner-self-
// serve list/void endpoints. Per docs/aios-design.md §13.4, scoping
// is a separate concern from access; this middleware only performs
// the latter.
const partnerOrSuperAdmin = async (c: AuthenticatedContext, next: Next) => {
    const role = c.get('userRole')
    if (role !== userRole.admin && role !== userRole.partner) {
        return fail(c, t('api.adminAccessDenied'), 403)
    }
    return next()
}

export default partnerOrSuperAdmin