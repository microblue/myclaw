import type { HonoEnv } from '@/ts/Types'

import { Hono } from 'hono'
import {
    getAdminAnalytics,
    getAdminBilling,
    getAdminClaws,
    getAdminEmails,
    getAdminExports,
    getAdminPendingClaws,
    getAdminReferrals,
    getAdminSSHKeys,
    getAdminStats,
    getAdminUsers,
    getAdminUserDetail,
    getAdminVolumes,
    getAdminWaitlist,
    updateAdminUser,
    getAdminSettings,
    updateAdminSetting,
    reassignAdminClaw,
    createActivationCodeBatch,
    getAdminActivationCodes,
    getAdminActivationCodeBatches,
    exportActivationCodeBatch,
    voidActivationCode,
    voidActivationCodeBatch
} from '@/controllers/admin'
import adminOnly from '@/middleware/adminOnly'

const app = new Hono<HonoEnv>()

app.use('/*', adminOnly)
app.get('/stats', getAdminStats)
app.get('/analytics', getAdminAnalytics)
app.get('/billing', getAdminBilling)
app.get('/users', getAdminUsers)
app.get('/users/:id', getAdminUserDetail)
app.put('/users/:id', updateAdminUser)
app.get('/claws', getAdminClaws)
app.put('/claws/:id/owner', reassignAdminClaw)
app.get('/pending-claws', getAdminPendingClaws)
app.get('/ssh-keys', getAdminSSHKeys)
app.get('/volumes', getAdminVolumes)
app.get('/referrals', getAdminReferrals)
app.get('/waitlist', getAdminWaitlist)
app.get('/exports', getAdminExports)
app.get('/emails', getAdminEmails)
app.get('/settings', getAdminSettings)
app.put('/settings/:key', updateAdminSetting)
app.get('/activation-codes', getAdminActivationCodes)
app.get('/activation-codes/batches', getAdminActivationCodeBatches)
app.post('/activation-codes/batches', createActivationCodeBatch)
app.get(
    '/activation-codes/batches/:batchId/export',
    exportActivationCodeBatch
)
app.put(
    '/activation-codes/batches/:batchId/void-unused',
    voidActivationCodeBatch
)
app.put('/activation-codes/:id/void', voidActivationCode)

export default app