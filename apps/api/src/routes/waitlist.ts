import { Hono } from 'hono'
import { joinWaitlist, checkWaitlist } from '@/controllers/waitlist'

const app = new Hono()

app.post('/', joinWaitlist)
app.get('/status', checkWaitlist)

export default app