import { Hono } from 'hono'
import { handlePolarWebhook } from '@/controllers/webhooks'

const app = new Hono()

app.post('/polar', handlePolarWebhook)

export default app