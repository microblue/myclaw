/**
 * Cloud Providers Module
 * 
 * This module exports all cloud provider implementations and the provider registry.
 * Import this module to auto-register all providers.
 */

// Import registry first
export { providerRegistry, default as registry } from './registry'

// Import types
export * from './types'

// Import and auto-register all providers
import './hetzner'
import './lightsail'
import './digitalocean'

// Re-export registry methods for convenience
import { providerRegistry } from './registry'

export const getProvider = providerRegistry.getProvider.bind(providerRegistry)
export const getAvailableProviders = providerRegistry.getAvailableProviders.bind(providerRegistry)
export const getDefaultProvider = providerRegistry.getDefaultProvider.bind(providerRegistry)
export const isProviderAvailable = providerRegistry.isProviderAvailable.bind(providerRegistry)
