import type { Context } from 'hono'

import { ok } from '@/lib/response'

const getPlans = async (c: Context) => {
    // Demo data - replace with real Hetzner/Polar pricing when API keys are configured
    // priceMonthly is the base price, priceYearly is 10 months (2 months free)
    const plans = [
        { id: 'cx11', name: 'CX11', cpu: 2, memory: 4, disk: 40, priceMonthly: 4.5, priceYearly: 45, architecture: 'x86', disabled: false },
        { id: 'cx21', name: 'CX21', cpu: 2, memory: 8, disk: 80, priceMonthly: 7.5, priceYearly: 75, architecture: 'x86', disabled: false },
        { id: 'cx31', name: 'CX31', cpu: 4, memory: 16, disk: 160, priceMonthly: 15, priceYearly: 150, architecture: 'x86', disabled: false },
        { id: 'cx41', name: 'CX41', cpu: 8, memory: 32, disk: 320, priceMonthly: 30, priceYearly: 300, architecture: 'x86', disabled: false }
    ]
    const atCapacity = false
    return ok(c, { plans, atCapacity }, 'api.plansFetched')
}

export default getPlans
