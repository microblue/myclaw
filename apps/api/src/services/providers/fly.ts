import type {
    CloudProvider,
    ContainerProvider,
    CreateServerOptions,
    CreateServerResult,
    ProviderInfo,
    ServerLocation,
    ServerPlan,
    ServerStatus,
    SSHKeyInfo
} from '@/services/providers/types'

import { providerRegistry } from '@/services/providers/registry'

// Fly.io container provider — the third deployment surface for AI-OS
// alongside the VM-based Hetzner / Lightsail / DigitalOcean. Per
// docs/aios-design.md §10 / §9.5, Fly cold-boots a pre-built
// `microblue/openclaw-aios` Docker image (built from the same
// install-claw.sh) inside <90 seconds, with a persistent volume
// mounted for the openclaw config + workspace. Per-instance config
// flows in as the same env vars install-claw.sh expects (ROOT_PASSWORD,
// SUBDOMAIN, DOMAIN, GATEWAY_TOKEN, CONFIG_JSON_B64, optional
// IE/IT/IR), but the installer itself doesn't run at boot — its work
// is baked into the image.
//
// This file is a SCAFFOLDING stub: the public shape, the registry
// entry, and the typed contract are in place so call sites can already
// declare `kind: 'container'` paths against it. Live API integration
// (machine create / get / start / stop, volume mount, deploy hook)
// requires real Fly auth and is left for a session that can verify
// against a Fly app — see TODO markers below.

// Reserved for the createServer / getServer implementations once Fly
// auth is wired up. Underscored to silence the unused-var lint while
// the value is still load-bearing documentation for the integration.
const _FLY_API_BASE = 'https://api.machines.dev/v1'
const FLY_IMAGE = 'registry-1.docker.io/microblue/openclaw-aios:latest'

class FlyProvider implements ContainerProvider {
    readonly providerId = 'fly'
    readonly providerName = 'Fly.io'
    readonly kind = 'container' as const
    readonly image = FLY_IMAGE

    private readonly token: string
    // Org slug is read from FLY_ORG_SLUG so the createServer call
    // (TODO) can target the right billing account; kept on the
    // instance so changing it doesn't require a server restart.
    private readonly _orgSlug: string

    constructor() {
        this.token = process.env.FLY_API_TOKEN || ''
        this._orgSlug = process.env.FLY_ORG_SLUG || 'personal'
    }

    getProviderInfo(): ProviderInfo {
        return {
            id: this.providerId,
            name: this.providerName,
            description:
                'Container-based AI-OS. Boots in under 90 seconds, billed by the second.',
            website: 'https://fly.io',
            regions: [
                'iad', 'lax', 'sjc', 'ord', 'mia',
                'fra', 'ams', 'lhr', 'cdg', 'arn',
                'nrt', 'sin', 'syd', 'hkg', 'gru'
            ],
            features: {
                volumes: true,
                snapshots: false,
                backups: false,
                ipv6: true,
                privateNetwork: true,
                loadBalancer: true,
                firewall: false,
                sshKeys: false
            },
            pricing: {
                currency: 'USD',
                billingUnit: 'hourly',
                minimumBilling: 0
            }
        }
    }

    // TODO(p2c-fly): wire up POST https://api.machines.dev/v1/apps/<app>/machines
    // with image=FLY_IMAGE, env=opts.userData-derived env vars,
    // services for ports 80/443/22. Block until 'started'. Return
    // { serverId: machine.id, ip: machine.private_ip, status: 'creating' }.
    async createServer(_opts: CreateServerOptions): Promise<CreateServerResult> {
        if (!this.token) throw new Error('FLY_API_TOKEN not set')
        throw new Error('FlyProvider.createServer: not implemented yet')
    }

    async getServer(_serverId: string): Promise<ServerStatus> {
        throw new Error('FlyProvider.getServer: not implemented yet')
    }

    async getServers(): Promise<Map<string, ServerStatus>> {
        throw new Error('FlyProvider.getServers: not implemented yet')
    }

    async startServer(_serverId: string): Promise<void> {
        throw new Error('FlyProvider.startServer: not implemented yet')
    }

    async stopServer(_serverId: string): Promise<void> {
        throw new Error('FlyProvider.stopServer: not implemented yet')
    }

    async restartServer(_serverId: string): Promise<void> {
        throw new Error('FlyProvider.restartServer: not implemented yet')
    }

    async deleteServer(_serverId: string): Promise<void> {
        throw new Error('FlyProvider.deleteServer: not implemented yet')
    }

    // Curated container plans. Fly bills per second on (CPU class +
    // memory MB); we expose a small set of fixed bundles so the SKU
    // catalogue maps cleanly to "shared-1x / 512", "shared-1x / 1024",
    // "performance-2x / 4096". Real Fly pricing fluctuates; values
    // here are approximate and should be re-derived at mint time.
    async getPlans(): Promise<ServerPlan[]> {
        return [
            {
                id: 'shared-cpu-1x-512',
                name: 'shared-cpu-1x · 512 MB',
                cpu: 1,
                memory: 0.5,
                disk: 1,
                diskType: 'ssd',
                bandwidth: 0,
                priceMonthly: 1.94,
                priceYearly: 23.28,
                architecture: 'x86'
            },
            {
                id: 'shared-cpu-1x-1024',
                name: 'shared-cpu-1x · 1 GB',
                cpu: 1,
                memory: 1,
                disk: 1,
                diskType: 'ssd',
                bandwidth: 0,
                priceMonthly: 5.7,
                priceYearly: 68.4,
                architecture: 'x86'
            },
            {
                id: 'performance-2x-4096',
                name: 'performance-2x · 4 GB',
                cpu: 2,
                memory: 4,
                disk: 1,
                diskType: 'ssd',
                bandwidth: 0,
                priceMonthly: 31,
                priceYearly: 372,
                architecture: 'x86'
            }
        ]
    }

    async getLocations(): Promise<ServerLocation[]> {
        return this.getProviderInfo().regions.map((r) => ({
            id: r,
            name: r.toUpperCase(),
            country: 'XX',
            region: r,
            continent: 'unknown'
        }))
    }

    async getPlanAvailability(): Promise<Record<string, string[]>> {
        const plans = await this.getPlans()
        const locs = (await this.getLocations()).map((l) => l.id)
        // Fly sells every plan in every region.
        return Object.fromEntries(plans.map((p) => [p.id, locs]))
    }

    async createSSHKey(_name: string, _publicKey: string): Promise<SSHKeyInfo> {
        // Fly doesn't have an SSH-keys API — `flyctl ssh console` uses
        // the org's own short-lived certificate. Surface this as a
        // hard error so callers don't silently rely on a no-op.
        throw new Error('FlyProvider does not support SSH keys')
    }

    async deleteSSHKey(_keyId: string): Promise<void> {
        throw new Error('FlyProvider does not support SSH keys')
    }
}

providerRegistry.register({
    id: 'fly',
    name: 'Fly.io',
    description: 'Container-based AI-OS, boots in under 90 seconds',
    logo: '/providers/fly.svg',
    envVars: ['FLY_API_TOKEN'],
    factory: (): CloudProvider | null => {
        if (!process.env.FLY_API_TOKEN) return null
        return new FlyProvider()
    }
})

export default FlyProvider