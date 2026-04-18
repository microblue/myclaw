import { describe, it, expect, beforeEach, vi } from 'vitest'

import type { CloudProvider, ProviderInfo, ProviderRegistryEntry } from './types'

const stubProviderInfo = (id: string): ProviderInfo => ({
    id,
    name: id,
    description: '',
    website: 'https://example.test',
    regions: ['r1'],
    features: {
        volumes: false,
        snapshots: false,
        backups: false,
        ipv6: false,
        privateNetwork: false,
        loadBalancer: false,
        firewall: false,
        sshKeys: false
    },
    pricing: {
        currency: 'USD',
        billingUnit: 'monthly',
        minimumBilling: 1
    }
})

const stubProvider = (id: string): CloudProvider => {
    const provider = {
        providerId: id,
        providerName: id,
        getProviderInfo: () => stubProviderInfo(id),
        createServer: vi.fn(),
        getServer: vi.fn(),
        getServers: vi.fn(),
        startServer: vi.fn(),
        stopServer: vi.fn(),
        restartServer: vi.fn(),
        deleteServer: vi.fn(),
        getPlans: vi.fn(),
        getLocations: vi.fn(),
        getPlanAvailability: vi.fn(),
        createSSHKey: vi.fn(),
        deleteSSHKey: vi.fn()
    } as unknown as CloudProvider
    return provider
}

const makeEntry = (
    id: string,
    envVars: string[],
    factory: () => CloudProvider | null
): ProviderRegistryEntry => ({
    id,
    name: id,
    description: '',
    logo: '',
    envVars,
    factory
})

// Fresh registry per test so state from one test does not leak into another.
const loadRegistry = async () => {
    vi.resetModules()
    const mod = await import('./registry')
    return mod.providerRegistry
}

describe('ProviderRegistry', () => {
    const ORIGINAL_ENV = { ...process.env }

    beforeEach(() => {
        vi.clearAllMocks()
        for (const key of Object.keys(process.env)) {
            if (!(key in ORIGINAL_ENV)) delete process.env[key]
        }
        Object.assign(process.env, ORIGINAL_ENV)
    })

    it('getProvider caches the instance and reuses it across calls', async () => {
        const registry = await loadRegistry()
        process.env.ACME_TOKEN = 'yes'
        const factory = vi.fn(() => stubProvider('acme'))
        registry.register(makeEntry('acme', ['ACME_TOKEN'], factory))

        const first = registry.getProvider('acme')
        const second = registry.getProvider('acme')

        expect(first).toBe(second)
        expect(factory).toHaveBeenCalledTimes(1)
    })

    it('getProvider re-invokes factory after cache TTL expires', async () => {
        const registry = await loadRegistry()
        process.env.ACME_TOKEN = 'yes'
        const factory = vi.fn(() => stubProvider('acme'))
        registry.register(makeEntry('acme', ['ACME_TOKEN'], factory))

        const realNow = Date.now.bind(Date)
        try {
            vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
            registry.getProvider('acme')
            // TTL is 5 minutes; jump well past that.
            vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 10 * 60 * 1000)
            registry.getProvider('acme')
        } finally {
            vi.spyOn(Date, 'now').mockImplementation(realNow)
        }

        expect(factory).toHaveBeenCalledTimes(2)
    })

    it('clearCache forces the next getProvider call to rebuild', async () => {
        const registry = await loadRegistry()
        process.env.ACME_TOKEN = 'yes'
        const factory = vi.fn(() => stubProvider('acme'))
        registry.register(makeEntry('acme', ['ACME_TOKEN'], factory))

        registry.getProvider('acme')
        registry.clearCache()
        registry.getProvider('acme')

        expect(factory).toHaveBeenCalledTimes(2)
    })

    it('returns null without invoking factory when env vars are missing', async () => {
        const registry = await loadRegistry()
        delete process.env.ACME_TOKEN
        const factory = vi.fn(() => stubProvider('acme'))
        registry.register(makeEntry('acme', ['ACME_TOKEN'], factory))

        expect(registry.getProvider('acme')).toBeNull()
        expect(factory).not.toHaveBeenCalled()
    })

    it('returns null without invoking factory when provider id is unknown', async () => {
        const registry = await loadRegistry()
        expect(registry.getProvider('ghost')).toBeNull()
    })

    it('does not cache when the factory returns null', async () => {
        const registry = await loadRegistry()
        process.env.ACME_TOKEN = 'yes'
        const factory = vi.fn(() => null)
        registry.register(makeEntry('acme', ['ACME_TOKEN'], factory))

        registry.getProvider('acme')
        registry.getProvider('acme')

        expect(factory).toHaveBeenCalledTimes(2)
    })

    it('getAvailableProviders only lists entries whose env vars are all set', async () => {
        const registry = await loadRegistry()
        process.env.ACME_TOKEN = 'yes'
        delete process.env.BETA_TOKEN
        registry.register(makeEntry('acme', ['ACME_TOKEN'], () => stubProvider('acme')))
        registry.register(makeEntry('beta', ['BETA_TOKEN'], () => stubProvider('beta')))

        const available = registry.getAvailableProviders()
        expect(available.map((p) => p.id)).toEqual(['acme'])
    })

    it('getDefaultProvider returns the first available provider', async () => {
        const registry = await loadRegistry()
        process.env.ACME_TOKEN = 'yes'
        process.env.BETA_TOKEN = 'yes'
        const acme = stubProvider('acme')
        const beta = stubProvider('beta')
        registry.register(makeEntry('acme', ['ACME_TOKEN'], () => acme))
        registry.register(makeEntry('beta', ['BETA_TOKEN'], () => beta))

        expect(registry.getDefaultProvider()).toBe(acme)
    })

    it('getDefaultProvider returns null when no providers are available', async () => {
        const registry = await loadRegistry()
        delete process.env.ACME_TOKEN
        registry.register(makeEntry('acme', ['ACME_TOKEN'], () => stubProvider('acme')))
        expect(registry.getDefaultProvider()).toBeNull()
    })

    it('isProviderAvailable checks env vars without instantiating the provider', async () => {
        const registry = await loadRegistry()
        process.env.ACME_TOKEN = 'yes'
        const factory = vi.fn(() => stubProvider('acme'))
        registry.register(makeEntry('acme', ['ACME_TOKEN'], factory))

        expect(registry.isProviderAvailable('acme')).toBe(true)
        delete process.env.ACME_TOKEN
        expect(registry.isProviderAvailable('acme')).toBe(false)
        expect(factory).not.toHaveBeenCalled()
    })
})
