import type { HonoEnv } from '@/ts/Types'

import { Hono } from 'hono'
import { postInstallPhase } from '@/controllers/install'
import { postLastPreview } from '@/controllers/intents'
import centralTokenAuth from '@/middleware/centralTokenAuth'

// Cloud-init / installer / runtime callback surface. Every endpoint
// here is authenticated by the per-claw central_token (NOT the user
// JWT) and scoped to the claw whose id appears in the URL.
const app = new Hono<HonoEnv>()

app.post('/:clawId/phase', centralTokenAuth, postInstallPhase)
app.post(
    '/:clawId/intents/last-preview',
    centralTokenAuth,
    postLastPreview
)

export default app