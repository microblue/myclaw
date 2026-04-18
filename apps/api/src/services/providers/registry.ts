/**
 * Provider Registry
 * 
 * Central registry for all cloud providers. Providers register themselves
 * here and the system can discover available providers based on configured
 * environment variables.
 */

import type { CloudProvider, ProviderRegistryEntry, ProviderInfo } from './types'

class ProviderRegistry {
    private providers: Map<string, ProviderRegistryEntry> = new Map()
    private instances: Map<string, CloudProvider> = new Map()
    private cacheExpiry: Map<string, number> = new Map()
    private readonly CACHE_TTL = 5 * 60 * 1000  // 5 minutes

    /**
     * Register a new provider
     */
    register(entry: ProviderRegistryEntry): void {
        this.providers.set(entry.id, entry)
    }

    /**
     * Get all registered providers (including unavailable ones)
     */
    getAllProviders(): ProviderRegistryEntry[] {
        return Array.from(this.providers.values())
    }

    /**
     * Get all available providers (with valid credentials)
     */
    getAvailableProviders(): { id: string; name: string; description: string; logo: string }[] {
        const available: { id: string; name: string; description: string; logo: string }[] = []
        
        for (const [id, entry] of this.providers) {
            // Check if all required env vars are present
            const hasCredentials = entry.envVars.every(
                (envVar) => process.env[envVar]
            )
            
            if (hasCredentials) {
                available.push({
                    id: entry.id,
                    name: entry.name,
                    description: entry.description,
                    logo: entry.logo
                })
            }
        }
        
        return available
    }

    /**
     * Get a provider instance by ID
     */
    getProvider(providerId: string): CloudProvider | null {
        // Check cache
        const cached = this.instances.get(providerId)
        const expiry = this.cacheExpiry.get(providerId) || 0
        
        if (cached && Date.now() < expiry) {
            return cached
        }

        const entry = this.providers.get(providerId)
        if (!entry) {
            console.error(`Provider not registered: ${providerId}`)
            return null
        }

        // Check credentials
        const missingVars = entry.envVars.filter((v) => !process.env[v])
        if (missingVars.length > 0) {
            console.error(`Provider ${providerId} missing env vars: ${missingVars.join(', ')}`)
            return null
        }

        // Create instance
        const instance = entry.factory()
        if (instance) {
            this.instances.set(providerId, instance)
            this.cacheExpiry.set(providerId, Date.now() + this.CACHE_TTL)
        }
        
        return instance
    }

    /**
     * Get the default provider (first available)
     */
    getDefaultProvider(): CloudProvider | null {
        const available = this.getAvailableProviders()
        if (available.length === 0) return null
        return this.getProvider(available[0].id)
    }

    /**
     * Check if a provider is available
     */
    isProviderAvailable(providerId: string): boolean {
        const entry = this.providers.get(providerId)
        if (!entry) return false
        return entry.envVars.every((v) => process.env[v])
    }

    /**
     * Get provider info
     */
    getProviderInfo(providerId: string): ProviderInfo | null {
        const provider = this.getProvider(providerId)
        return provider?.getProviderInfo() || null
    }

    /**
     * Clear cached instances
     */
    clearCache(): void {
        this.instances.clear()
        this.cacheExpiry.clear()
    }
}

// Singleton instance
export const providerRegistry = new ProviderRegistry()

export default providerRegistry