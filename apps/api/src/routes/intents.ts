import type { HonoEnv } from '@/ts/Types'

import { Hono } from 'hono'
import {
    listIntents,
    createIntent,
    updateIntent,
    deleteIntent
} from '@/controllers/intents'

// Intent CRUD lives behind the user JWT middleware applied at the
// app-level (see app.ts). The list endpoint is mounted under
// /claws/:clawId/intents to make the claw-scoped intent the obvious
// access pattern; the per-intent endpoints take the intent id
// directly because the claw is implied by the intent row's FK.
const app = new Hono<HonoEnv>()

app.get('/claws/:clawId/intents', listIntents)
app.post('/intents', createIntent)
app.patch('/intents/:id', updateIntent)
app.delete('/intents/:id', deleteIntent)

export default app