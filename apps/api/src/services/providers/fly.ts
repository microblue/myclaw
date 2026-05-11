import type {
    CloudProvider,
    ContainerProvider,
    CreateServerOptions,
    CreateServerResult,
    ProviderInfo,
    ServerLocation,
    ServerPlan,
    ServerStatus,
    SSHKeyInfo,
    VolumeInfo
} from '@/services/providers/types'

import { providerRegistry } from '@/services/providers/registry'

// Fly.io container provider — the third deployment surface for AI-OS
// alongside the VM-based Hetzner / Lightsail / DigitalOcean. Fly cold-boots
// the pre-built `microblue/openclaw-aios` Docker image (built from
// apps/api/docker/) inside ~90 seconds, with a persistent volume mounted
// at /data for the openclaw config + workspace. Per-instance config flows
// in as the same env vars install-claw.sh expects (SUBDOMAIN, DOMAIN,
// GATEWAY_TOKEN, CONFIG_JSON_B64, optional OPENROUTER_API_KEY + IE/IT/IR),
// but the installer itself doesn't run at boot — its work is baked into
// the image.
//
// One-app-per-claw model: each claw gets its own Fly app, one machine
// inside it, one shared IPv4. Cleaner tenant isolation than packing
// machines into a single app + handling per-hostname routing on the
// edge proxy. Trade-off: more Fly app overhead, but at the activation-
// code price points this is comfortably absorbed.

const FLY_API_BASE = 'https://api.machines.dev/v1'
const FLY_IMAGE =
    process.env.FLY_AIOS_IMAGE ||
    'registry-1.docker.io/microblue/openclaw-aios:latest'

interface FlyMachineGuest {
    cpu_kind: 'shared' | 'performance'
    cpus: number
    memory_mb: number
}

interface PlanGuestMap {
    guest: FlyMachineGuest
}

// Map our curated SKU ids to Fly's machine guest specs. Bound here
// (not on the plan record) so changes to Fly's internal naming don't
// leak into the activation-code schema.
const PLAN_GUEST: Record<string, PlanGuestMap> = {
    'shared-cpu-1x-512': {
        guest: { cpu_kind: 'shared', cpus: 1, memory_mb: 512 }
    },
    'shared-cpu-1x-1024': {
        guest: { cpu_kind: 'shared', cpus: 1, memory_mb: 1024 }
    },
    'performance-2x-4096': {
        guest: { cpu_kind: 'performance', cpus: 2, memory_mb: 4096 }
    }
}

interface FlyMachine {
    id: string
    name: string
    state: string
    region: string
    private_ip?: string
    created_at?: string
}

interface FlyApp {
    id?: string
    name: string
    organization?: { slug: string }
}

interface FlyIp {
    id?: string
    address: string
    type: string
}

class FlyProvider implements ContainerProvider {
    readonly providerId = 'fly'
    readonly providerName = 'Fly.io'
    readonly kind = 'container' as const
    readonly image = FLY_IMAGE

    private readonly token: string
    private readonly orgSlug: string

    constructor() {
        this.token = process.env.FLY_API_TOKEN || ''
        this.orgSlug = process.env.FLY_ORG_SLUG || 'personal'
    }

    private headers(): Record<string, string> {
        return {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json'
        }
    }

    private async fly<T>(
        path: string,
        init: RequestInit = {}
    ): Promise<T> {
        if (!this.token) throw new Error('FLY_API_TOKEN not set')
        const res = await fetch(`${FLY_API_BASE}${path}`, {
            ...init,
            headers: { ...this.headers(), ...(init.headers || {}) }
        })
        if (!res.ok) {
            const body = await res.text().catch(() => '')
            throw new Error(
                `Fly ${init.method || 'GET'} ${path} → ${res.status}: ${body.slice(0, 500)}`
            )
        }
        if (res.status === 204) return undefined as T
        return (await res.json()) as T
    }

    // App name = stable, lowercase, ≤30 chars. Fly enforces a globally
    // unique app namespace per org, so we prefix with `myclaw-` and use
    // the caller-provided name (which already includes a short id slug
    // from generateServerName).
    private appName(name: string): string {
        return `myclaw-${name}`
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 30)
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

    async createServer(opts: CreateServerOptions): Promise<CreateServerResult> {
        if (!this.token) throw new Error('FLY_API_TOKEN not set')

        const planSpec = PLAN_GUEST[opts.planId]
        if (!planSpec) {
            throw new Error(
                `Unknown Fly plan: ${opts.planId}. Expected one of: ${Object.keys(PLAN_GUEST).join(', ')}`
            )
        }

        const appName = this.appName(opts.name)
        const region = opts.locationId

        // 1. Create the app (idempotent: if it already exists, treat as
        // success — keeps retries from failing on transient network
        // errors after the app got created).
        try {
            await this.fly<FlyApp>('/apps', {
                method: 'POST',
                body: JSON.stringify({
                    app_name: appName,
                    org_slug: this.orgSlug
                })
            })
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            if (!/already (exists|taken)/i.test(msg)) throw err
        }

        // 2. Allocate a shared IPv4 for the app. Shared anycast IPs are
        // free; dedicated IPs cost $2/mo. Trial-tier claws use shared.
        let ip = ''
        try {
            const ipRes = await this.fly<FlyIp>(`/apps/${appName}/ips`, {
                method: 'POST',
                body: JSON.stringify({ type: 'shared_v4' })
            })
            ip = ipRes.address
        } catch (err) {
            // If the app already had an IP from a prior run, list and
            // reuse. Failing the whole createServer on a duplicate
            // allocation would orphan the app.
            const ips = await this.fly<{ ips: FlyIp[] }>(
                `/apps/${appName}/ips`
            ).catch(() => ({ ips: [] }))
            const v4 = ips.ips?.find((i) => i.type.includes('v4'))
            if (v4) ip = v4.address
            else throw err
        }

        // 3. Create the machine inside the app. Services declares the
        // ports Fly's edge will forward; protocol=tcp lets Caddy inside
        // the container handle TLS termination directly.
        const env = opts.env || {}
        const machine = await this.fly<FlyMachine>(
            `/apps/${appName}/machines`,
            {
                method: 'POST',
                body: JSON.stringify({
                    name: opts.name,
                    region,
                    config: {
                        image: this.image,
                        env,
                        guest: planSpec.guest,
                        services: [
                            {
                                protocol: 'tcp',
                                internal_port: 443,
                                ports: [
                                    { port: 80, handlers: [] },
                                    { port: 443, handlers: [] }
                                ]
                            }
                        ],
                        // Auto-restart on crash; matches the systemd
                        // Restart=always on VM claws.
                        restart: { policy: 'always' }
                    }
                })
            }
        )

        return {
            serverId: appName,
            ip,
            status: this.mapState(machine.state)
        }
    }

    // Maps Fly's machine state values onto our internal status taxonomy.
    // Fly's vocabulary: created, starting, started, stopping, stopped,
    // suspending, suspended, replacing, destroying, destroyed, failed.
    private mapState(state: string): ServerStatus['status'] {
        switch (state) {
            case 'started':
                return 'running'
            case 'starting':
            case 'created':
            case 'replacing':
                return 'starting'
            case 'stopping':
            case 'suspending':
                return 'stopping'
            case 'stopped':
            case 'suspended':
                return 'stopped'
            case 'destroying':
            case 'destroyed':
                return 'unknown'
            case 'failed':
                return 'error'
            default:
                return 'unknown'
        }
    }

    private async getMachine(appName: string): Promise<FlyMachine | null> {
        const machines = await this.fly<FlyMachine[]>(
            `/apps/${appName}/machines`
        ).catch(() => [] as FlyMachine[])
        // One-app-per-claw: there's exactly one machine. Filter out
        // destroyed ones in case of a botched recreate.
        return (
            machines.find((m) => !['destroyed', 'failed'].includes(m.state)) ||
            null
        )
    }

    async getServer(serverId: string): Promise<ServerStatus> {
        const appName = serverId
        const machine = await this.getMachine(appName)
        if (!machine) {
            throw new Error(`No live machine in app ${appName}`)
        }
        const ips = await this.fly<{ ips: FlyIp[] }>(
            `/apps/${appName}/ips`
        ).catch(() => ({ ips: [] }))
        const v4 = ips.ips?.find((i) => i.type.includes('v4'))
        return {
            id: machine.id,
            name: machine.name,
            status: this.mapState(machine.state),
            ip: v4?.address || '',
            planId: '',
            locationId: machine.region,
            createdAt: machine.created_at
                ? new Date(machine.created_at)
                : new Date()
        }
    }

    async getServers(): Promise<Map<string, ServerStatus>> {
        // No bulk "all machines across all apps" endpoint — caller must
        // iterate apps. The sync scheduler today only calls getServer
        // per-id so this map stays empty for the container path.
        return new Map()
    }

    async startServer(serverId: string): Promise<void> {
        const appName = serverId
        const machine = await this.getMachine(appName)
        if (!machine) throw new Error(`No machine in app ${appName}`)
        await this.fly(`/apps/${appName}/machines/${machine.id}/start`, {
            method: 'POST'
        })
    }

    async stopServer(serverId: string): Promise<void> {
        const appName = serverId
        const machine = await this.getMachine(appName)
        if (!machine) throw new Error(`No machine in app ${appName}`)
        await this.fly(`/apps/${appName}/machines/${machine.id}/stop`, {
            method: 'POST'
        })
    }

    async restartServer(serverId: string): Promise<void> {
        const appName = serverId
        const machine = await this.getMachine(appName)
        if (!machine) throw new Error(`No machine in app ${appName}`)
        await this.fly(`/apps/${appName}/machines/${machine.id}/restart`, {
            method: 'POST'
        })
    }

    async deleteServer(serverId: string): Promise<void> {
        const appName = serverId
        // Deleting the app cascades to machines + volumes + IPs. Cleaner
        // than orchestrating per-resource teardown.
        await this.fly(`/apps/${appName}`, { method: 'DELETE' })
    }

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
        return Object.fromEntries(plans.map((p) => [p.id, locs]))
    }

    async createSSHKey(): Promise<SSHKeyInfo> {
        // Fly doesn't have an SSH-keys API — `flyctl ssh console` uses
        // the org's own short-lived certificate. Surface this as a hard
        // error so callers don't silently rely on a no-op.
        throw new Error('FlyProvider does not support SSH keys')
    }

    async deleteSSHKey(): Promise<void> {
        throw new Error('FlyProvider does not support SSH keys')
    }

    // Volume support — claws that want persistent /data across restarts
    // get a Fly volume in the same region as the app. The mount is
    // declared on the machine config; createVolume returns the id and
    // the caller wires the mount into a follow-up machine update or
    // recreate. For the trial path we skip volumes (ephemeral state is
    // fine), so this is exercised mainly by paid SKUs.
    async createVolume(
        name: string,
        size: number,
        locationId: string,
        serverId?: string
    ): Promise<VolumeInfo> {
        if (!serverId) {
            throw new Error('Fly volume requires the app (serverId) to attach to')
        }
        const appName = serverId
        const vol = await this.fly<{
            id: string
            name: string
            size_gb: number
            state: string
            region: string
        }>(`/apps/${appName}/volumes`, {
            method: 'POST',
            body: JSON.stringify({
                name: name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                region: locationId,
                size_gb: size
            })
        })
        return {
            id: vol.id,
            name: vol.name,
            size: vol.size_gb,
            status: 'available',
            attachedTo: serverId,
            locationId: vol.region
        }
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