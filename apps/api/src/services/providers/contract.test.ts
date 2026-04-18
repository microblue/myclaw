import { describe, it, expect, beforeAll } from 'vitest'

// Stub credentials before importing providers, since some constructors
// (lightsail, digitalocean) read env at instantiation time. All factories
// are lazy with respect to network I/O — this only unlocks construction.
process.env.HETZNER_API_TOKEN ??= 'contract-test'
process.env.AWS_ACCESS_KEY_ID ??= 'contract-test'
process.env.AWS_SECRET_ACCESS_KEY ??= 'contract-test'
process.env.DIGITALOCEAN_TOKEN ??= 'contract-test'

import type { CloudProvider, ProviderFeatures } from './types'
import { providerRegistry } from './registry'
import './hetzner'
import './lightsail'
import './digitalocean'

const REQUIRED_METHODS = [
    'createServer',
    'getServer',
    'getServers',
    'startServer',
    'stopServer',
    'restartServer',
    'deleteServer',
    'getPlans',
    'getLocations',
    'getPlanAvailability',
    'createSSHKey',
    'deleteSSHKey'
] as const

const FEATURE_FLAGS: (keyof ProviderFeatures)[] = [
    'volumes',
    'snapshots',
    'backups',
    'ipv6',
    'privateNetwork',
    'loadBalancer',
    'firewall',
    'sshKeys'
]

const VOLUME_METHODS = [
    'createVolume',
    'attachVolume',
    'detachVolume',
    'deleteVolume',
    'getVolume',
    'getVolumePricing'
] as const

const entries = providerRegistry.getAllProviders()

describe('CloudProvider contract', () => {
    it('has at least one registered provider', () => {
        expect(entries.length).toBeGreaterThan(0)
    })

    for (const entry of entries) {
        describe(entry.id, () => {
            let provider: CloudProvider

            beforeAll(() => {
                const instance = entry.factory()
                expect(instance).not.toBeNull()
                provider = instance as CloudProvider
            })

            it('exposes providerId matching registry id', () => {
                expect(provider.providerId).toBe(entry.id)
            })

            it('exposes a non-empty providerName', () => {
                expect(typeof provider.providerName).toBe('string')
                expect(provider.providerName.length).toBeGreaterThan(0)
            })

            it('getProviderInfo returns a well-shaped ProviderInfo', () => {
                const info = provider.getProviderInfo()
                expect(info.id).toBe(entry.id)
                expect(typeof info.name).toBe('string')
                expect(typeof info.description).toBe('string')
                expect(typeof info.website).toBe('string')
                expect(Array.isArray(info.regions)).toBe(true)
                expect(info.regions.length).toBeGreaterThan(0)
                expect(['hourly', 'monthly', 'both']).toContain(
                    info.pricing.billingUnit
                )
                expect(typeof info.pricing.currency).toBe('string')
                expect(typeof info.pricing.minimumBilling).toBe('number')
            })

            it('features has every flag declared as a boolean', () => {
                const { features } = provider.getProviderInfo()
                for (const flag of FEATURE_FLAGS) {
                    expect(typeof features[flag]).toBe('boolean')
                }
            })

            it('implements every required method as a function', () => {
                for (const method of REQUIRED_METHODS) {
                    expect(typeof provider[method]).toBe('function')
                }
            })

            it('volume feature flag matches volume method presence', () => {
                const { features } = provider.getProviderInfo()
                for (const method of VOLUME_METHODS) {
                    const present =
                        typeof provider[method as keyof CloudProvider] ===
                        'function'
                    if (features.volumes) {
                        expect(present, `${method} should exist when features.volumes=true`).toBe(true)
                    }
                }
            })
        })
    }
})
