import type { Context } from 'hono'

import { t } from '@openclaw/i18n'
import { ok } from '@/lib/response'
import { generateClawName } from '@/controllers/claws/helpers'
import withErrorHandler from '@/lib/withErrorHandler'

const suggestClawName = withErrorHandler(
    'suggestClawName',
    'api.internalServerError'
)(async (c: Context) => {
    return ok(c, { name: generateClawName() }, t('api.clawNameSuggested'))
})

export default suggestClawName