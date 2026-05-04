import { Hono } from 'hono'
import { submitInstallReport } from '@/controllers/installReports'

const app = new Hono()

// Public endpoint — desktop installer hits this when bootstrap fails. The
// user typically isn't logged in yet (install hasn't reached pairing), so
// no auth. IP rate-limit lives in the controller.
app.post('/', submitInstallReport)

export default app