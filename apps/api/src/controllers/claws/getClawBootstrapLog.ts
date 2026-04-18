import type { AuthenticatedContext } from '@/ts/Types'

import executeSSH from '@/services/ssh'
import { findUserClaw } from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

// Reads /var/log/openclaw-bootstrap.log from the VPS so the dashboard
// can show what cloud-init / the generateCloudInit bash script is
// doing while the claw is still in the "Deploying Claw" stage. Owner-
// or-admin only. Tail rather than full file — the log is a few dozen
// KB and we don't want to ship the whole thing on every refresh.

const getClawBootstrapLog = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const claw = await findUserClaw(userId, id, c.get('isAdmin'))

        if (!claw) return fail(c, t('api.clawNotFound'), 404)
        if (!claw.ip || !claw.rootPassword)
            return fail(c, t('api.failedToGetDiagnostics'), 400)

        const output = await executeSSH(
            claw.ip,
            claw.rootPassword,
            // `|| true` so an empty / missing file returns the stderr
            // ("No such file or directory") rather than failing the
            // whole SSH call; the UI renders it verbatim.
            'tail -200 /var/log/openclaw-bootstrap.log 2>&1 || true'
        )

        return ok(c, { logs: output }, t('api.logsFetched'))
    } catch (error) {
        console.error('getClawBootstrapLog', error)
        return fail(
            c,
            error instanceof Error
                ? error.message
                : t('api.failedToGetDiagnostics'),
            500
        )
    }
}

export default getClawBootstrapLog