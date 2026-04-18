/**
 * Hetzner Cloud Provider Implementation
 * 
 * Wraps the existing Hetzner service to implement the CloudProvider interface.
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
} from './types'
import hetzner from '@/services/hetzner'
import { providerRegistry } from '@/services/providers/registry'

class HetznerProvider implements CloudProvider {
    readonly providerId = 'hetzner'
    readonly providerName = 'Hetzner Cloud'

    getProviderInfo(): ProviderInfo {
        return {
            id: 'hetzner',
            name: 'Hetzner Cloud',
            description: 'German cloud provider with excellent price-performance ratio',
            logo: '/providers/hetzner.svg',
            website: 'https://www.hetzner.com/cloud',
            regions: ['eu-central', 'eu-west', 'us-east', 'us-west', 'ap-southeast'],
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
                currency: 'EUR',
                billingUnit: 'monthly',
                minimumBilling: 1
            }
        }
    }

    async createServer(options: CreateServerOptions): Promise<CreateServerResult> {
        const result = await hetzner.createServer(
            options.name,
            options.planId,
            options.locationId,
            options.rootPassword,
            options.sshKeyIds?.map(id => parseInt(id, 10)),
            undefined,  // snapshotId
            options.userData
        )
        return {
            serverId: result.serverId.toString(),
            ip: result.ip,
            status: 'creating'
        }
    }

    async getServer(serverId: string): Promise<ServerStatus> {
        const server = await hetzner.getServer(serverId)
        return {
            id: serverId,
            name: server.name,
            status: this.mapStatus(server.status),
            ip: server.ip,
            planId: '',
            locationId: '',
            createdAt: new Date()
        }
    }

    async getServers(): Promise<Map<string, ServerStatus>> {
        const servers = await hetzner.getServers()
        const result = new Map<string, ServerStatus>()
        for (const [id, server] of servers) {
            result.set(id, {
                id,
                name: server.name,
                status: this.mapStatus(server.status),
                ip: server.ip,
                planId: '',
                locationId: '',
                createdAt: new Date()
            })
        }
        return result
    }

    async startServer(serverId: string): Promise<void> {
        await hetzner.startServer(serverId)
    }

    async stopServer(serverId: string): Promise<void> {
        await hetzner.stopServer(serverId)
    }

    async restartServer(serverId: string): Promise<void> {
        await hetzner.restartServer(serverId)
    }

    async deleteServer(serverId: string): Promise<void> {
        await hetzner.deleteServer(serverId)
    }

    async getPlans(): Promise<ServerPlan[]> {
        const types = await hetzner.getServerTypes()
        return types.map(t => ({
            id: t.name,
            name: t.name.toUpperCase(),
            description: t.description,
            cpu: t.cpu,
            memory: t.memory,
            disk: t.disk,
            diskType: 'nvme' as const,
            bandwidth: 20,  // Hetzner offers 20TB included
            priceMonthly: t.priceMonthly,
            priceYearly: parseFloat((t.priceMonthly * 10).toFixed(2)),
            priceHourly: t.priceMonthly / 730,
            architecture: (t.architecture === 'arm' ? 'arm64' : 'x86') as 'x86' | 'arm64',
            disabled: t.disabled
        }))
    }

    async getLocations(): Promise<ServerLocation[]> {
        const locations = await hetzner.getLocations()
        return locations.map(l => ({
            id: l.id,
            name: l.name,
            city: l.city,
            country: l.country,
            region: this.mapRegion(l.id),
            continent: this.mapContinent(l.country),
            disabled: l.disabled
        }))
    }

    async getPlanAvailability(): Promise<Record<string, string[]>> {
        const datacenters = await hetzner.getDatacenters()
        const rawTypes = await hetzner.getRawServerTypes()
        
        const typeIdToName = new Map<number, string>()
        for (const t of rawTypes) {
            typeIdToName.set(t.id, t.name)
        }

        const availability: Record<string, string[]> = {}
        for (const dc of datacenters) {
            for (const typeId of dc.availableServerTypeIds) {
                const typeName = typeIdToName.get(typeId)
                if (typeName) {
                    if (!availability[typeName]) {
                        availability[typeName] = []
                    }
                    if (!availability[typeName].includes(dc.locationName)) {
                        availability[typeName].push(dc.locationName)
                    }
                }
            }
        }
        return availability
    }

    async createSSHKey(name: string, publicKey: string): Promise<SSHKeyInfo> {
        const result = await hetzner.createSSHKey(name, publicKey)
        return {
            id: result.id.toString(),
            name: result.name,
            fingerprint: result.fingerprint,
            publicKey: result.publicKey,
            createdAt: new Date()
        }
    }

    async deleteSSHKey(keyId: string): Promise<void> {
        await hetzner.deleteSSHKey(parseInt(keyId, 10))
    }

    async getVolumePricing(): Promise<VolumePricing> {
        const pricing = await hetzner.getVolumePricing()
        return {
            pricePerGbMonthly: pricing.pricePerGbMonthly,
            minSize: 10,
            maxSize: 10000
        }
    }

    async createVolume(name: string, size: number, locationId: string, serverId?: string): Promise<VolumeInfo> {
        const result = await hetzner.createVolume(
            name,
            size,
            locationId,
            serverId ? parseInt(serverId, 10) : undefined
        )
        return {
            id: result.id.toString(),
            name: result.name,
            size: result.size,
            status: 'available',
            locationId
        }
    }

    async attachVolume(volumeId: string, serverId: string): Promise<void> {
        await hetzner.attachVolume(parseInt(volumeId, 10), parseInt(serverId, 10))
    }

    async detachVolume(volumeId: string): Promise<void> {
        await hetzner.detachVolume(parseInt(volumeId, 10))
    }

    async deleteVolume(volumeId: string): Promise<void> {
        await hetzner.deleteVolume(parseInt(volumeId, 10))
    }

    async getVolume(volumeId: string): Promise<VolumeInfo> {
        const volume = await hetzner.getVolume(parseInt(volumeId, 10))
        return {
            id: volumeId,
            name: volume.name,
            size: volume.size,
            status: volume.status as VolumeInfo['status'],
            attachedTo: volume.attachedTo?.toString(),
            locationId: volume.location
        }
    }

    private mapStatus(status: string): ServerStatus['status'] {
        const map: Record<string, ServerStatus['status']> = {
            running: 'running',
            off: 'stopped',
            starting: 'starting',
            stopping: 'stopping',
            initializing: 'creating',
            migrating: 'running',
            rebuilding: 'creating',
            unknown: 'unknown'
        }
        return map[status] || 'unknown'
    }

    private mapRegion(locationId: string): string {
        const regions: Record<string, string> = {
            fsn1: 'eu-central',
            nbg1: 'eu-central',
            hel1: 'eu-north',
            ash: 'us-east',
            hil: 'us-west',
            sin: 'ap-southeast'
        }
        return regions[locationId] || 'unknown'
    }

    private mapContinent(country: string): string {
        const continents: Record<string, string> = {
            DE: 'EU',
            FI: 'EU',
            US: 'NA',
            SG: 'AS'
        }
        return continents[country] || 'unknown'
    }
}

// Register the provider
providerRegistry.register({
    id: 'hetzner',
    name: 'Hetzner Cloud',
    description: 'German cloud with excellent price-performance',
    logo: '/providers/hetzner.svg',
    envVars: ['HETZNER_API_TOKEN'],
    factory: () => new HetznerProvider()
})

export default HetznerProvider