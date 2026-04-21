import type { AuthenticatedContext } from '@/ts/Types'

import executeSSH from '@/services/ssh'
import { findUserClaw } from '@/controllers/claws/helpers'
import { getClawRuntime, DEFAULT_CLAW_TYPE } from '@/services/clawRuntimes'
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

        // Per-runtime log file so PicoClaw claws surface
        // /var/log/picoclaw-gateway.log instead of an empty tab. The
        // systemdUnit name doubles as the log filename in our cloud-init
        // (both OpenClaw and PicoClaw systemd units redirect stdout to
        // /var/log/<unit>.log). `|| true` keeps the SSH exec green when
        // the file doesn't exist yet — the UI renders stderr verbatim,
        // more useful than a red error banner.
        const runtime =
            getClawRuntime(claw.clawType || DEFAULT_CLAW_TYPE) ||
            getClawRuntime(DEFAULT_CLAW_TYPE)!
        const logFile = `/var/log/${runtime.systemdUnit}.log`
        const output = await executeSSH(
            claw.ip,
            claw.rootPassword,
            `tail -200 ${logFile} 2>&1 || true`
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