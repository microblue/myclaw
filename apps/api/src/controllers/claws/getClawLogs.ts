import type { AuthenticatedContext } from '@/ts/Types'

import executeSSH from '@/services/ssh'
import { findUserClaw } from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const getClawLogs = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const claw = await findUserClaw(userId, id, c.get('isAdmin'))

        if (!claw) return fail(c, t('api.clawNotFound'), 404)

        if (!claw.ip || !claw.rootPassword)
            return fail(c, t('api.failedToGetDiagnostics'), 400)

        // `|| true` so the SSH call succeeds even when the log file
        // doesn't exist yet (cloud-init hasn't finished, or the gateway
        // never ran). The UI renders the stderr ("No such file…")
        // verbatim, which is more useful than a red error banner.
        const output = await executeSSH(
            claw.ip,
            claw.rootPassword,
            'tail -200 /var/log/openclaw-gateway.log 2>&1 || true'
        )

        return ok(c, { logs: output }, t('api.logsFetched'))
    } catch (error) {
        console.error('getClawLogs', error)
        return fail(
            c,
            error instanceof Error
                ? error.message
                : t('api.failedToGetDiagnostics'),
            500
        )
    }
}

export default getClawLogs