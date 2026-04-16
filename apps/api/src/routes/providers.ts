/**
 * Provider Routes
 * 
 * API endpoints for cloud provider management.
 */

import { Hono } from 'hono'
import {
    getProviders,
    getProviderInfo,
    getProviderPlans,
    getProviderLocations,
    getProviderAvailability,
    getProviderVolumePricing
} from '@/controllers/providers'

const providersRoutes = new Hono()

// List all available providers (no auth required for discovery)
providersRoutes.get('/', getProviders)

// Provider details and resources
providersRoutes.get('/:providerId', getProviderInfo)
providersRoutes.get('/:providerId/plans', getProviderPlans)
providersRoutes.get('/:providerId/locations', getProviderLocations)
providersRoutes.get('/:providerId/availability', getProviderAvailability)
providersRoutes.get('/:providerId/volume-pricing', getProviderVolumePricing)

export default providersRoutes
