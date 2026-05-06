import type { HonoEnv } from '@/ts/Types'

import { Hono } from 'hono'
import {
    createActivationCodeBatch,
    getAdminActivationCodes,
    getAdminActivationCodeBatches,
    exportActivationCodeBatch,
    voidActivationCode,
    voidActivationCodeBatch
} from '@/controllers/admin'
import partnerOrSuperAdmin from '@/middleware/partnerOrSuperAdmin'

// Partner-self-serve surface. Same controller bodies as the /admin
// counterparts — they internally scope by partner_id when called by a
// partner role, or expose everything when called by super-admin. The
// route gate here is partnerOrSuperAdmin; super-admin can hit either
// /admin or /partner and get the same data.
const app = new Hono<HonoEnv>()

app.use('/*', partnerOrSuperAdmin)

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