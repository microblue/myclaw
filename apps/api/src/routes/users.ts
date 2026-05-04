import type { HonoEnv } from '@/ts/Types'

import { Hono } from 'hono'
import {
    getCurrentUser,
    getBillingHistory,
    getOrderInvoice,
    getCustomerPortal,
    getUserStats,
    purchaseLicense,
    updateUserProfile
} from '@/controllers/users'

const app = new Hono<HonoEnv>()

app.get('/me', getCurrentUser)
app.get('/me/stats', getUserStats)
app.get('/me/billing', getBillingHistory)
app.get('/me/billing/:orderId/invoice', getOrderInvoice)
app.post('/me/billing/portal', getCustomerPortal)
app.put('/me', updateUserProfile)
app.post('/me/license/checkout', purchaseLicense)

export default app
