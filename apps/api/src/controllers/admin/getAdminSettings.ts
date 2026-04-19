import type { AuthenticatedContext } from '@/ts/Types'

import { ok } from '@/lib/response'
import { t } from '@openclaw/i18n'
import withErrorHandler from '@/lib/withErrorHandler'
import {
    listSystemSettings,
    isSecretKey,
    maskSecret
} from '@/services/systemSettings'

// Returns all system_settings rows with secret values masked so the
// admin UI can render them without leaking raw credentials in page
// source / dev-tools.

const getAdminSettings = withErrorHandler(
    'getAdminSettings',
    'api.failedToLoadSettings'
)(async (c: AuthenticatedContext) => {
    const rows = await listSystemSettings()
    const settings = rows.map((r) => ({
        key: r.key,
        value: isSecretKey(r.key) ? maskSecret(r.value) : r.value,
        isSecret: isSecretKey(r.key),
        updatedAt: r.updatedAt
    }))
    return ok(c, { settings }, t('api.adminSettingsFetched'))
})

export default getAdminSettings