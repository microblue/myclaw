import type { HonoEnv } from '@/ts/Types'

import { Hono } from 'hono'
import { getSSHKeys, createSSHKey, deleteSSHKey } from '@/controllers/ssh-keys'

const app = new Hono<HonoEnv>()

app.get('/', getSSHKeys)
app.post('/', createSSHKey)
app.delete('/:id', deleteSSHKey)

export default app