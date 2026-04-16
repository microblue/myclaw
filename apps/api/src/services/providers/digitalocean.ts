/**
 * DigitalOcean Provider Implementation
 * 
 * DigitalOcean Droplets with simple pricing and developer-friendly API.
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
    VolumeInfo,
    VolumePricing
} from '../types'
import { providerRegistry } from '@/services/providers/registry'
import { RequestClient } from '@openclaw/shared'

interface DODroplet {
    id: number
    name: string
    status: string
    size_slug: string
    region: { slug: string }
    networks: {
        v4: Array<{ ip_address: string; type: string }>
        v6: Array<{ ip_address: string; type: string }>
    }
    created_at: string
}

interface DOSize {
    slug: string
    memory: number
    vcpus: number
    disk: number
    transfer: number
    price_monthly: number
    price_hourly: number
    available: boolean
    regions: string[]
    description: string
}

interface DORegion {
    slug: string
    name: string
    available: boolean
    features: string[]
    sizes: string[]
}

interface DOSSHKey {
    id: number
    name: string
    fingerprint: string
    public_key: string
}

interface DOVolume {
    id: string
    name: string
    size_gigabytes: number
    region: { slug: string }
    droplet_ids: number[]
}

class DigitalOceanProvider implements CloudProvider {
    readonly providerId = 'digitalocean'
    readonly providerName = 'DigitalOcean'
    private client: RequestClient

    constructor() {
        const token = process.env.DIGITALOCEAN_TOKEN!
        this.client = new RequestClient({
            baseUrl: 'https://api.digitalocean.com/v2',
            getHeaders: () => ({
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            })
        })
    }

    getProviderInfo(): ProviderInfo {
        return {
            id: 'digitalocean',
            name: 'DigitalOcean',
            description: 'Developer-friendly cloud platform with simple pricing',
            logo: '/providers/digitalocean.svg',
            website: 'https://www.digitalocean.com',
            regions: [
                'nyc1', 'nyc3', 'sfo2', 'sfo3', 'tor1',
                'ams3', 'lon1', 'fra1',
                'blr1', 'sgp1', 'syd1'
            ],
            features: {
                volumes: true,
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
                billingUnit: 'hourly',
                minimumBilling: 1
            }
        }
    }

    async createServer(options: CreateServerOptions): Promise<CreateServerResult> {
        const body: Record<string, unknown> = {
            name: options.name,
            region: options.locationId,
            size: options.planId,
            image: 'ubuntu-24-04-x64',
            user_data: options.userData,
            ipv6: true,
            monitoring: true
        }

        if (options.sshKeyIds?.length) {
            body.ssh_keys = options.sshKeyIds.map(id => parseInt(id, 10))
        }

        if (options.tags) {
            body.tags = Object.keys(options.tags)
        }

        const response = await this.client.post<{ droplet: DODroplet }>('/droplets', body)
        
        // DigitalOcean assigns IP asynchronously, need to poll
        const dropletId = response.droplet.id.toString()
        
        // Wait for IP assignment (up to 60 seconds)
        let ip = '0.0.0.0'
        for (let i = 0; i < 12; i++) {
            await new Promise(r => setTimeout(r, 5000))
            try {
                const status = await this.getServer(dropletId)
                if (status.ip && status.ip !== '0.0.0.0') {
                    ip = status.ip
                    break
                }
            } catch (e) {
                // Keep trying
            }
        }

        return {
            serverId: dropletId,
            ip,
            status: 'creating'
        }
    }

    async getServer(serverId: string): Promise<ServerStatus> {
        const response = await this.client.get<{ droplet: DODroplet }>(`/droplets/${serverId}`)
        const droplet = response.droplet

        const publicIpv4 = droplet.networks.v4.find(n => n.type === 'public')
        const publicIpv6 = droplet.networks.v6.find(n => n.type === 'public')

        return {
            id: droplet.id.toString(),
            name: droplet.name,
            status: this.mapStatus(droplet.status),
            ip: publicIpv4?.ip_address || '',
            ipv6: publicIpv6?.ip_address,
            planId: droplet.size_slug,
            locationId: droplet.region.slug,
            createdAt: new Date(droplet.created_at)
        }
    }

    async getServers(): Promise<Map<string, ServerStatus>> {
        const response = await this.client.get<{ droplets: DODroplet[] }>('/droplets?per_page=200')
        
        const result = new Map<string, ServerStatus>()
        for (const droplet of response.droplets) {
            const publicIpv4 = droplet.networks.v4.find(n => n.type === 'public')
            const publicIpv6 = droplet.networks.v6.find(n => n.type === 'public')

            result.set(droplet.id.toString(), {
                id: droplet.id.toString(),
                name: droplet.name,
                status: this.mapStatus(droplet.status),
                ip: publicIpv4?.ip_address || '',
                ipv6: publicIpv6?.ip_address,
                planId: droplet.size_slug,
                locationId: droplet.region.slug,
                createdAt: new Date(droplet.created_at)
            })
        }
        return result
    }

    async startServer(serverId: string): Promise<void> {
        await this.client.post(`/droplets/${serverId}/actions`, { type: 'power_on' })
    }

    async stopServer(serverId: string): Promise<void> {
        await this.client.post(`/droplets/${serverId}/actions`, { type: 'power_off' })
    }

    async restartServer(serverId: string): Promise<void> {
        await this.client.post(`/droplets/${serverId}/actions`, { type: 'reboot' })
    }

    async deleteServer(serverId: string): Promise<void> {
        await this.client.delete(`/droplets/${serverId}`)
    }

    async getPlans(): Promise<ServerPlan[]> {
        const response = await this.client.get<{ sizes: DOSize[] }>('/sizes?per_page=200')
        
        return response.sizes
            .filter(s => s.available && s.slug.startsWith('s-'))  // Basic droplets
            .map(s => ({
                id: s.slug,
                name: this.formatSizeName(s.slug),
                description: s.description,
                cpu: s.vcpus,
                memory: s.memory / 1024,  // Convert MB to GB
                disk: s.disk,
                diskType: 'ssd' as const,
                bandwidth: s.transfer,
                priceMonthly: s.price_monthly,
                priceYearly: parseFloat((s.price_monthly * 10).toFixed(2)),
                priceHourly: s.price_hourly,
                architecture: 'x86' as const,
                disabled: !s.available,
                availableLocations: s.regions
            }))
            .sort((a, b) => a.priceMonthly - b.priceMonthly)
    }

    async getLocations(): Promise<ServerLocation[]> {
        const response = await this.client.get<{ regions: DORegion[] }>('/regions')
        
        return response.regions
            .filter(r => r.available)
            .map(r => ({
                id: r.slug,
                name: r.name,
                city: this.getCity(r.slug),
                country: this.getCountry(r.slug),
                region: r.slug,
                continent: this.getContinent(r.slug),
                disabled: !r.available,
                availablePlans: r.sizes
            }))
    }

    async getPlanAvailability(): Promise<Record<string, string[]>> {
        const response = await this.client.get<{ sizes: DOSize[] }>('/sizes?per_page=200')
        
        const availability: Record<string, string[]> = {}
        for (const size of response.sizes) {
            if (size.available) {
                availability[size.slug] = size.regions
            }
        }
        return availability
    }

    async createSSHKey(name: string, publicKey: string): Promise<SSHKeyInfo> {
        const response = await this.client.post<{ ssh_key: DOSSHKey }>('/account/keys', {
            name,
            public_key: publicKey
        })
        
        return {
            id: response.ssh_key.id.toString(),
            name: response.ssh_key.name,
            fingerprint: response.ssh_key.fingerprint,
            publicKey: response.ssh_key.public_key,
            createdAt: new Date()
        }
    }

    async deleteSSHKey(keyId: string): Promise<void> {
        await this.client.delete(`/account/keys/${keyId}`)
    }

    async getVolumePricing(): Promise<VolumePricing> {
        // DigitalOcean charges $0.10/GB/month for volumes
        return {
            pricePerGbMonthly: 0.10,
            minSize: 1,
            maxSize: 16000
        }
    }

    async createVolume(name: string, size: number, locationId: string, serverId?: string): Promise<VolumeInfo> {
        const body: Record<string, unknown> = {
            name,
            size_gigabytes: size,
            region: locationId,
            filesystem_type: 'ext4'
        }

        const response = await this.client.post<{ volume: DOVolume }>('/volumes', body)
        
        if (serverId) {
            await this.attachVolume(response.volume.id, serverId)
        }

        return {
            id: response.volume.id,
            name: response.volume.name,
            size: response.volume.size_gigabytes,
            status: 'available',
            locationId
        }
    }

    async attachVolume(volumeId: string, serverId: string): Promise<void> {
        await this.client.post(`/volumes/${volumeId}/actions`, {
            type: 'attach',
            droplet_id: parseInt(serverId, 10)
        })
    }

    async detachVolume(volumeId: string): Promise<void> {
        // Get volume to find attached droplet
        const response = await this.client.get<{ volume: DOVolume }>(`/volumes/${volumeId}`)
        if (response.volume.droplet_ids.length > 0) {
            await this.client.post(`/volumes/${volumeId}/actions`, {
                type: 'detach',
                droplet_id: response.volume.droplet_ids[0]
            })
        }
    }

    async deleteVolume(volumeId: string): Promise<void> {
        await this.client.delete(`/volumes/${volumeId}`)
    }

    async getVolume(volumeId: string): Promise<VolumeInfo> {
        const response = await this.client.get<{ volume: DOVolume }>(`/volumes/${volumeId}`)
        const volume = response.volume
        
        return {
            id: volume.id,
            name: volume.name,
            size: volume.size_gigabytes,
            status: volume.droplet_ids.length > 0 ? 'attached' : 'available',
            attachedTo: volume.droplet_ids[0]?.toString(),
            locationId: volume.region.slug
        }
    }

    private mapStatus(status: string): ServerStatus['status'] {
        const map: Record<string, ServerStatus['status']> = {
            active: 'running',
            off: 'stopped',
            new: 'creating',
            archive: 'stopped'
        }
        return map[status] || 'unknown'
    }

    private formatSizeName(slug: string): string {
        // s-1vcpu-1gb -> 1 vCPU / 1 GB
        const match = slug.match(/s-(\d+)vcpu-(\d+)gb/)
        if (match) {
            return `${match[1]} vCPU / ${match[2]} GB`
        }
        return slug
    }

    private getCity(slug: string): string {
        const cities: Record<string, string> = {
            nyc1: 'New York',
            nyc3: 'New York',
            sfo2: 'San Francisco',
            sfo3: 'San Francisco',
            tor1: 'Toronto',
            ams3: 'Amsterdam',
            lon1: 'London',
            fra1: 'Frankfurt',
            blr1: 'Bangalore',
            sgp1: 'Singapore',
            syd1: 'Sydney'
        }
        return cities[slug] || slug
    }

    private getCountry(slug: string): string {
        const countries: Record<string, string> = {
            nyc1: 'US', nyc3: 'US', sfo2: 'US', sfo3: 'US',
            tor1: 'CA',
            ams3: 'NL',
            lon1: 'GB',
            fra1: 'DE',
            blr1: 'IN',
            sgp1: 'SG',
            syd1: 'AU'
        }
        return countries[slug] || 'US'
    }

    private getContinent(slug: string): string {
        const continents: Record<string, string> = {
            nyc1: 'NA', nyc3: 'NA', sfo2: 'NA', sfo3: 'NA', tor1: 'NA',
            ams3: 'EU', lon1: 'EU', fra1: 'EU',
            blr1: 'AS', sgp1: 'AS',
            syd1: 'OC'
        }
        return continents[slug] || 'NA'
    }
}

// Register the provider
providerRegistry.register({
    id: 'digitalocean',
    name: 'DigitalOcean',
    description: 'Developer-friendly cloud with simple pricing',
    logo: '/providers/digitalocean.svg',
    envVars: ['DIGITALOCEAN_TOKEN'],
    factory: () => new DigitalOceanProvider()
})

export default DigitalOceanProvider
