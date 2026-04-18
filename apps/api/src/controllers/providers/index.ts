/**
 * Providers Controller
 * 
 * API endpoints for cloud provider management.
 */

import type { Context } from 'hono'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import { providerRegistry } from '@/services/providers'

/**
 * GET /providers
 * List all available cloud providers
 */
export const getProviders = async (c: Context) => {
    const providers = providerRegistry.getAvailableProviders()
    
    return ok(c, providers, t('api.providersRetrieved'))
}

/**
 * GET /providers/:providerId
 * Get detailed info about a specific provider
 */
export const getProviderInfo = async (c: Context) => {
    const providerId = c.req.param('providerId')
    if (!providerId) {
        return fail(c, t('api.providerNotFound'), 404)
    }

    const provider = providerRegistry.getProvider(providerId)
    if (!provider) {
        return fail(c, t('api.providerNotFound'), 404)
    }
    
    const info = provider.getProviderInfo()
    return ok(c, info, t('api.providerInfoRetrieved'))
}

/**
 * GET /providers/:providerId/plans
 * Get available server plans for a provider
 */
export const getProviderPlans = async (c: Context) => {
    const providerId = c.req.param('providerId')
    if (!providerId) {
        return fail(c, t('api.providerNotFound'), 404)
    }

    const provider = providerRegistry.getProvider(providerId)
    if (!provider) {
        return fail(c, t('api.providerNotFound'), 404)
    }
    
    try {
        const plans = await provider.getPlans()
        return ok(c, plans, t('api.plansRetrieved'))
    } catch (error) {
        console.error(`Failed to get plans for ${providerId}:`, error)
        return fail(c, t('api.failedToGetPlans'), 500)
    }
}

/**
 * GET /providers/:providerId/locations
 * Get available locations for a provider
 */
export const getProviderLocations = async (c: Context) => {
    const providerId = c.req.param('providerId')
    if (!providerId) {
        return fail(c, t('api.providerNotFound'), 404)
    }

    const provider = providerRegistry.getProvider(providerId)
    if (!provider) {
        return fail(c, t('api.providerNotFound'), 404)
    }
    
    try {
        const locations = await provider.getLocations()
        return ok(c, locations, t('api.locationsRetrieved'))
    } catch (error) {
        console.error(`Failed to get locations for ${providerId}:`, error)
        return fail(c, t('api.failedToGetLocations'), 500)
    }
}

/**
 * GET /providers/:providerId/availability
 * Get plan availability per location for a provider
 */
export const getProviderAvailability = async (c: Context) => {
    const providerId = c.req.param('providerId')
    if (!providerId) {
        return fail(c, t('api.providerNotFound'), 404)
    }

    const provider = providerRegistry.getProvider(providerId)
    if (!provider) {
        return fail(c, t('api.providerNotFound'), 404)
    }
    
    try {
        const availability = await provider.getPlanAvailability()
        return ok(c, availability, t('api.availabilityRetrieved'))
    } catch (error) {
        console.error(`Failed to get availability for ${providerId}:`, error)
        return fail(c, t('api.failedToGetAvailability'), 500)
    }
}

/**
 * GET /providers/:providerId/volume-pricing
 * Get volume pricing for a provider (if supported)
 */
export const getProviderVolumePricing = async (c: Context) => {
    const providerId = c.req.param('providerId')
    if (!providerId) {
        return fail(c, t('api.providerNotFound'), 404)
    }

    const provider = providerRegistry.getProvider(providerId)
    if (!provider) {
        return fail(c, t('api.providerNotFound'), 404)
    }
    
    const info = provider.getProviderInfo()
    if (!info.features.volumes || !provider.getVolumePricing) {
        return fail(c, t('api.providerDoesNotSupportVolumes'), 400)
    }
    
    try {
        const pricing = await provider.getVolumePricing()
        return ok(c, pricing, t('api.volumePricingRetrieved'))
    } catch (error) {
        console.error(`Failed to get volume pricing for ${providerId}:`, error)
        return fail(c, t('api.failedToGetVolumePricing'), 500)
    }
}