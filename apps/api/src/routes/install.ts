import type { HonoEnv } from '@/ts/Types'

import { Hono } from 'hono'
import { postInstallPhase } from '@/controllers/install'
import centralTokenAuth from '@/middleware/centralTokenAuth'

// Cloud-init / installer callback surface. Every endpoint here is
// authenticated by the per-claw central_token (NOT the user JWT) and
// scoped to the claw whose id appears in the URL.
const app = new Hono<HonoEnv>()

app.post('/:clawId/phase', centralTokenAuth, postInstallPhase)

export default app