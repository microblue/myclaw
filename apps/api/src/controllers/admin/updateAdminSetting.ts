import type { AuthenticatedContext } from '@/ts/Types'

import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'
import withErrorHandler from '@/lib/withErrorHandler'
import { setSystemSetting } from '@/services/systemSettings'

// Upsert a single system_settings row. Admin-only (middleware enforced
// on the /admin router). The body is { value: string | null }; an
// empty string clears the value so the provisioner falls back to the
// "no default configured" branch.

const updateAdminSetting = withErrorHandler(
    'updateAdminSetting',
    'api.failedToUpdateSetting'
)(async (c: AuthenticatedContext) => {
    const key = c.req.param('key')
    if (!key) return fail(c, t('api.badRequest'), 400)

    const body = await c.req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
        return fail(c, t('api.badRequest'), 400)
    }

    const rawValue = (body as { value?: unknown }).value
    const value =
        rawValue === null || rawValue === undefined || rawValue === ''
            ? null
            : String(rawValue)

    const updatedBy = c.get('userId') || undefined
    await setSystemSetting(key, value, updatedBy)

    return ok(c, null, t('api.settingUpdated'))
})

export default updateAdminSetting
