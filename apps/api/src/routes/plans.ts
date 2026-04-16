import { Hono } from 'hono'
import {
    getPlans,
    getLocations,
    getVolumePricing,
    getPlanAvailability
} from '@/controllers/plans'

const app = new Hono()

app.get('/', getPlans)
app.get('/locations', getLocations)
app.get('/volume-pricing', getVolumePricing)
app.get('/availability', getPlanAvailability)

export default app