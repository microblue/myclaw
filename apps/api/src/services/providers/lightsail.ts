/**
 * AWS Lightsail Provider Implementation
 * 
 * AWS Lightsail is a simplified VPS service from AWS, perfect for
 * small to medium deployments with predictable pricing.
 */

import type {
    CloudProvider,
    ProviderInfo,
    ServerPlan,
    ServerLocation,
    CreateServerOptions,
    CreateServerResult,
    ServerStatus,
    SSHKeyInfo,
    VolumePricing
} from './types'
import { providerRegistry } from '@/services/providers/registry'
import {
    LightsailClient,
    GetBundlesCommand,
    GetRegionsCommand,
    CreateInstancesCommand,
    GetInstanceCommand,
    GetInstancesCommand,
    StartInstanceCommand,
    StopInstanceCommand,
    RebootInstanceCommand,
    DeleteInstanceCommand,
    CreateKeyPairCommand,
    DeleteKeyPairCommand,
    AllocateStaticIpCommand,
    AttachStaticIpCommand,
    ReleaseStaticIpCommand,
    PutInstancePublicPortsCommand
} from '@aws-sdk/client-lightsail'

// Lightsail bundle (plan) pricing - USD per month
const BUNDLE_PRICING: Record<string, number> = {
    'nano_3_0': 3.50,
    'micro_3_0': 5.00,
    'small_3_0': 10.00,
    'medium_3_0': 20.00,
    'large_3_0': 40.00,
    'xlarge_3_0': 80.00,
    '2xlarge_3_0': 160.00,
    // ARM bundles
    'nano_arm_3_0': 3.50,
    'micro_arm_3_0': 5.00,
    'small_arm_3_0': 10.00,
    'medium_arm_3_0': 20.00,
    'large_arm_3_0': 40.00,
    'xlarge_arm_3_0': 80.00,
    '2xlarge_arm_3_0': 160.00
}

class LightsailProvider implements CloudProvider {
    readonly providerId = 'lightsail'
    readonly providerName = 'AWS Lightsail'
    private client: LightsailClient

    constructor() {
        this.client = new LightsailClient({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
            }
        })
    }

    getProviderInfo(): ProviderInfo {
        return {
            id: 'lightsail',
            name: 'AWS Lightsail',
            description: 'Simple VPS from Amazon Web Services with predictable pricing',
            logo: '/providers/aws-lightsail.svg',
            website: 'https://aws.amazon.com/lightsail/',
            regions: [
                'us-east-1', 'us-east-2', 'us-west-2',
                'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
                'ap-south-1', 'ap-northeast-1', 'ap-northeast-2', 'ap-southeast-1', 'ap-southeast-2',
                'ca-central-1', 'sa-east-1'
            ],
            features: {
                volumes: false,
                snapshots: true,
                backups: true,
                ipv6: true,
                privateNetwork: true,
                loadBalancer: true,
                firewall: true,
                sshKeys: true
            },
            pricing: {
                currency: 'USD',
                billingUnit: 'monthly',
                minimumBilling: 1
            }
        }
    }

    async createServer(options: CreateServerOptions): Promise<CreateServerResult> {
        // Determine blueprint (OS) and availability zone
        const blueprintId = 'ubuntu_24_04'
        // locationId is region (e.g. us-west-2), AZ = region + 'a'
        const availabilityZone = options.locationId + 'a'
        console.log('[lightsail] locationId:', options.locationId, '-> AZ:', availabilityZone)

        // Use region-specific client so cross-region creation works
        const regionClient = new LightsailClient({
            region: options.locationId,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
            }
        })

                const command = new CreateInstancesCommand({
            instanceNames: [options.name],
            availabilityZone,
            blueprintId,
            bundleId: options.planId,
            userData: options.userData,
            keyPairName: options.sshKeyIds?.[0],
            tags: options.tags ? Object.entries(options.tags).map(([key, value]) => ({ key, value })) : undefined
        })

        const response = await regionClient.send(command)
        const instance = response.operations?.[0]

        if (!instance?.resourceName) {
            throw new Error('Failed to create Lightsail instance')
        }

        // Open the Lightsail-level firewall for HTTPS. New instances only
        // have 22 + 80 open by default; without this certbot can
        // get a cert but external clients time out on :443. 22/80 have
        // to be listed too since PutInstancePublicPorts replaces the
        // whole rule set.
        regionClient
            .send(
                new PutInstancePublicPortsCommand({
                    instanceName: options.name,
                    portInfos: [
                        {
                            fromPort: 22,
                            toPort: 22,
                            protocol: 'tcp',
                            cidrs: ['0.0.0.0/0'],
                            ipv6Cidrs: ['::/0']
                        },
                        {
                            fromPort: 80,
                            toPort: 80,
                            protocol: 'tcp',
                            cidrs: ['0.0.0.0/0'],
                            ipv6Cidrs: ['::/0']
                        },
                        {
                            fromPort: 443,
                            toPort: 443,
                            protocol: 'tcp',
                            cidrs: ['0.0.0.0/0'],
                            ipv6Cidrs: ['::/0']
                        }
                    ]
                })
            )
            .catch((err) =>
                console.error('[lightsail] PutInstancePublicPorts', err)
            )

        // Allocate static IP and attach async (instance may not be running yet)
        const staticIpName = options.name + '-ip'
        const doAttachStaticIp = async () => {
            try {
                await regionClient.send(new AllocateStaticIpCommand({ staticIpName }))
                // Wait for instance to be running before attaching (up to 3 minutes)
                let running = false
                for (let i = 0; i < 36; i++) {
                    await new Promise(r => setTimeout(r, 5000))
                    try {
                        const status = await this.getServer(options.name)
                        if (status.status === 'running') { running = true; break }
                    } catch (_) {}
                }
                if (running) {
                    await regionClient.send(new AttachStaticIpCommand({ staticIpName, instanceName: options.name }))
                    console.log('[lightsail] Static IP attached to', options.name)
                } else {
                    console.warn('[lightsail] Instance not running after 3min, skip static IP attach')
                }
            } catch (e) {
                console.error('[lightsail] Static IP error (non-fatal):', e instanceof Error ? e.message : e)
            }
        }
        doAttachStaticIp()  // fire and forget

        return {
            serverId: options.name,
            ip: '0.0.0.0',
            status: 'creating'
        }
    }

    // Lightsail instances live in one region and any API call against
    // them must use a client pointed at that region. Callers pass the
    // locationId (= AWS region) so we can pick the right client. When
    // they can't supply it (e.g. legacy call sites), fall back to the
    // default client — that matches the old behaviour.
    private regionClients = new Map<string, LightsailClient>()

    private clientFor(locationId?: string): LightsailClient {
        if (!locationId) return this.client
        const cached = this.regionClients.get(locationId)
        if (cached) return cached
        const c = new LightsailClient({
            region: locationId,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
            }
        })
        this.regionClients.set(locationId, c)
        return c
    }

    async getServer(
        serverId: string,
        locationId?: string
    ): Promise<ServerStatus> {
        const command = new GetInstanceCommand({ instanceName: serverId })
        const response = await this.clientFor(locationId).send(command)
        const instance = response.instance

        if (!instance) {
            throw new Error(`Instance not found: ${serverId}`)
        }

        return {
            id: instance.name!,
            name: instance.name!,
            status: this.mapStatus(instance.state?.name || 'unknown'),
            ip: instance.publicIpAddress || '',
            ipv6: instance.ipv6Addresses?.[0],
            planId: instance.bundleId || '',
            locationId: instance.location?.regionName || '',
            createdAt: instance.createdAt || new Date()
        }
    }

    async getServers(): Promise<Map<string, ServerStatus>> {
        const command = new GetInstancesCommand({})
        const response = await this.client.send(command)

        const result = new Map<string, ServerStatus>()
        for (const instance of response.instances || []) {
            if (instance.name) {
                result.set(instance.name, {
                    id: instance.name,
                    name: instance.name,
                    status: this.mapStatus(instance.state?.name || 'unknown'),
                    ip: instance.publicIpAddress || '',
                    ipv6: instance.ipv6Addresses?.[0],
                    planId: instance.bundleId || '',
                    locationId: instance.location?.regionName || '',
                    createdAt: instance.createdAt || new Date()
                })
            }
        }
        return result
    }

    async startServer(serverId: string, locationId?: string): Promise<void> {
        await this.clientFor(locationId).send(
            new StartInstanceCommand({ instanceName: serverId })
        )
    }

    async stopServer(serverId: string, locationId?: string): Promise<void> {
        await this.clientFor(locationId).send(
            new StopInstanceCommand({ instanceName: serverId })
        )
    }

    async restartServer(
        serverId: string,
        locationId?: string
    ): Promise<void> {
        await this.clientFor(locationId).send(
            new RebootInstanceCommand({ instanceName: serverId })
        )
    }

    async deleteServer(serverId: string, locationId?: string): Promise<void> {
        const client = this.clientFor(locationId)
        // Release static IP first (ignore if it doesn't exist)
        try {
            await client.send(
                new ReleaseStaticIpCommand({ staticIpName: `${serverId}-ip` })
            )
        } catch (_) {
            /* ignore */
        }

        await client.send(new DeleteInstanceCommand({ instanceName: serverId }))
    }

    async getPlans(): Promise<ServerPlan[]> {
        const command = new GetBundlesCommand({ includeInactive: false })
        const response = await this.client.send(command)
        
        return (response.bundles || [])
            .filter(b => b.isActive && b.supportedPlatforms?.includes('LINUX_UNIX'))
            .map(b => ({
                id: b.bundleId!,
                name: this.formatBundleName(b.bundleId!),
                description: `${b.cpuCount} vCPU, ${b.ramSizeInGb} GB RAM, ${b.diskSizeInGb} GB SSD`,
                cpu: b.cpuCount || 1,
                memory: b.ramSizeInGb || 0.5,
                disk: b.diskSizeInGb || 20,
                diskType: 'ssd' as const,
                bandwidth: (b.transferPerMonthInGb || 1000) / 1000,  // Convert to TB
                priceMonthly: BUNDLE_PRICING[b.bundleId!] || b.price || 5,
                priceYearly: parseFloat(((BUNDLE_PRICING[b.bundleId!] || b.price || 5) * 10).toFixed(2)),
                priceHourly: (BUNDLE_PRICING[b.bundleId!] || 5) / 730,
                architecture: b.bundleId?.includes('arm') ? 'arm64' as const : 'x86' as const,
                disabled: !b.isActive
            }))
            .sort((a, b) => a.priceMonthly - b.priceMonthly)
    }

    async getLocations(): Promise<ServerLocation[]> {
        const command = new GetRegionsCommand({ includeAvailabilityZones: false })
        const response = await this.client.send(command)
        
        return (response.regions || [])
            .filter(r => r.name)
            .map(r => ({
                id: r.name!,
                name: r.displayName || r.name!,
                city: this.getCity(r.name!),
                country: this.getCountry(r.name!),
                region: r.name!,
                continent: r.continentCode || 'NA',
                disabled: false
            }))
    }

    async getPlanAvailability(): Promise<Record<string, string[]>> {
        // Lightsail bundles are available in all regions
        const plans = await this.getPlans()
        const locations = await this.getLocations()
        
        const availability: Record<string, string[]> = {}
        for (const plan of plans) {
            availability[plan.id] = locations.map(l => l.id)
        }
        return availability
    }

    async createSSHKey(name: string, publicKey: string): Promise<SSHKeyInfo> {
        // Lightsail requires importing existing keys differently
        // For now, we create a new key pair and the user must use it
        const command = new CreateKeyPairCommand({ keyPairName: name })
        const response = await this.client.send(command)
        
        return {
            id: response.keyPair?.name || name,
            name: response.keyPair?.name || name,
            fingerprint: response.keyPair?.fingerprint || '',
            publicKey: response.publicKeyBase64 || '',
            createdAt: response.keyPair?.createdAt || new Date()
        }
    }

    async deleteSSHKey(keyId: string): Promise<void> {
        await this.client.send(new DeleteKeyPairCommand({ keyPairName: keyId }))
    }

    async getVolumePricing(): Promise<VolumePricing> {
        // AWS Lightsail Block Storage: $0.10/GB/month
        return {
            pricePerGbMonthly: 0.10,
            minSize: 8,
            maxSize: 16384
        }
    }

    private mapStatus(status: string): ServerStatus['status'] {
        const map: Record<string, ServerStatus['status']> = {
            running: 'running',
            stopped: 'stopped',
            pending: 'creating',
            stopping: 'stopping',
            starting: 'starting'
        }
        return map[status] || 'unknown'
    }

    private formatBundleName(bundleId: string): string {
        // nano_3_0 -> Nano, micro_arm_3_0 -> Micro ARM
        const parts = bundleId.split('_')
        let name = parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
        if (parts.includes('arm')) {
            name += ' ARM'
        }
        return name
    }

    private getCity(region: string): string {
        const cities: Record<string, string> = {
            'us-east-1': 'N. Virginia',
            'us-east-2': 'Ohio',
            'us-west-2': 'Oregon',
            'eu-west-1': 'Ireland',
            'eu-west-2': 'London',
            'eu-west-3': 'Paris',
            'eu-central-1': 'Frankfurt',
            'eu-north-1': 'Stockholm',
            'ap-south-1': 'Mumbai',
            'ap-northeast-1': 'Tokyo',
            'ap-northeast-2': 'Seoul',
            'ap-southeast-1': 'Singapore',
            'ap-southeast-2': 'Sydney',
            'ca-central-1': 'Montreal',
            'sa-east-1': 'São Paulo'
        }
        return cities[region] || region
    }

    private getCountry(region: string): string {
        const countries: Record<string, string> = {
            'us-east-1': 'US',
            'us-east-2': 'US',
            'us-west-2': 'US',
            'eu-west-1': 'IE',
            'eu-west-2': 'GB',
            'eu-west-3': 'FR',
            'eu-central-1': 'DE',
            'eu-north-1': 'SE',
            'ap-south-1': 'IN',
            'ap-northeast-1': 'JP',
            'ap-northeast-2': 'KR',
            'ap-southeast-1': 'SG',
            'ap-southeast-2': 'AU',
            'ca-central-1': 'CA',
            'sa-east-1': 'BR'
        }
        return countries[region] || 'US'
    }
}

// Register the provider
providerRegistry.register({
    id: 'lightsail',
    name: 'AWS Lightsail',
    description: 'Simple VPS from Amazon Web Services',
    logo: '/providers/aws-lightsail.svg',
    envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
    factory: () => new LightsailProvider()
})

export default LightsailProvider