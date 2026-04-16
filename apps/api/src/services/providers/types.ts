/**
 * Multi-Provider Cloud Infrastructure Types
 * 
 * This module defines the interfaces for multi-cloud provider support.
 * Each provider (AWS Lightsail, AWS EC2, DigitalOcean, Hetzner, etc.)
 * implements these interfaces to provide a unified API.
 */

export interface ProviderInfo {
    id: string
    name: string
    description: string
    logo?: string
    website: string
    regions: string[]  // Available region codes
    features: ProviderFeatures
    pricing: PricingModel
}

export interface ProviderFeatures {
    volumes: boolean         // Supports attached volumes
    snapshots: boolean       // Supports server snapshots
    backups: boolean         // Supports automated backups
    ipv6: boolean           // Supports IPv6
    privateNetwork: boolean  // Supports private networking
    loadBalancer: boolean    // Supports load balancers
    firewall: boolean        // Supports firewall rules
    sshKeys: boolean        // Supports SSH key management
}

export interface PricingModel {
    currency: string
    billingUnit: 'hourly' | 'monthly' | 'both'
    minimumBilling: number  // Minimum billing period in hours
}

export interface ServerPlan {
    id: string              // Provider-specific plan ID
    name: string            // Display name
    description?: string
    cpu: number             // vCPU count
    memory: number          // RAM in GB
    disk: number            // Disk in GB
    diskType: 'ssd' | 'nvme' | 'hdd'
    bandwidth: number       // Monthly bandwidth in TB (0 = unlimited)
    priceHourly?: number    // Hourly price in USD
    priceMonthly: number    // Monthly price in USD
    priceYearly: number     // Yearly price in USD (typically 10x monthly)
    architecture: 'x86' | 'arm64'
    disabled?: boolean
    availableLocations?: string[]  // If limited to specific locations
}

export interface ServerLocation {
    id: string              // Provider-specific location ID
    name: string            // Display name (e.g., "US East (N. Virginia)")
    city?: string           // City name
    country: string         // Country code (ISO 3166-1 alpha-2)
    region: string          // Region code (e.g., "us-east-1")
    continent: string       // Continent code
    disabled?: boolean
    availablePlans?: string[]  // If limited to specific plans
}

export interface CreateServerOptions {
    name: string
    planId: string
    locationId: string
    rootPassword?: string
    sshKeyIds?: string[]    // Provider-specific SSH key IDs
    userData?: string       // Cloud-init script
    tags?: Record<string, string>
}

export interface CreateServerResult {
    serverId: string
    ip: string
    ipv6?: string
    status: string
}

export interface ServerStatus {
    id: string
    name: string
    status: 'running' | 'stopped' | 'starting' | 'stopping' | 'creating' | 'error' | 'unknown'
    ip: string
    ipv6?: string
    planId: string
    locationId: string
    createdAt: Date
}

export interface SSHKeyInfo {
    id: string
    name: string
    fingerprint: string
    publicKey: string
    createdAt: Date
}

export interface VolumeInfo {
    id: string
    name: string
    size: number            // Size in GB
    status: 'available' | 'attached' | 'creating' | 'deleting' | 'error'
    attachedTo?: string     // Server ID if attached
    locationId: string
}

export interface VolumePricing {
    pricePerGbMonthly: number
    minSize: number
    maxSize: number
}

/**
 * CloudProvider Interface
 * 
 * All cloud providers must implement this interface to be usable
 * in the MyClaw platform.
 */
export interface CloudProvider {
    // Provider metadata
    readonly providerId: string
    readonly providerName: string
    getProviderInfo(): ProviderInfo

    // Server operations
    createServer(options: CreateServerOptions): Promise<CreateServerResult>
    getServer(serverId: string): Promise<ServerStatus>
    getServers(): Promise<Map<string, ServerStatus>>
    startServer(serverId: string): Promise<void>
    stopServer(serverId: string): Promise<void>
    restartServer(serverId: string): Promise<void>
    deleteServer(serverId: string): Promise<void>

    // Plan and location info
    getPlans(): Promise<ServerPlan[]>
    getLocations(): Promise<ServerLocation[]>
    getPlanAvailability(): Promise<Record<string, string[]>>  // planId -> locationIds

    // SSH key management
    createSSHKey(name: string, publicKey: string): Promise<SSHKeyInfo>
    deleteSSHKey(keyId: string): Promise<void>

    // Volume operations (optional - check features.volumes)
    getVolumePricing?(): Promise<VolumePricing>
    createVolume?(name: string, size: number, locationId: string, serverId?: string): Promise<VolumeInfo>
    attachVolume?(volumeId: string, serverId: string): Promise<void>
    detachVolume?(volumeId: string): Promise<void>
    deleteVolume?(volumeId: string): Promise<void>
    getVolume?(volumeId: string): Promise<VolumeInfo>
}

/**
 * Provider Registry Entry
 */
export interface ProviderRegistryEntry {
    id: string
    name: string
    description: string
    logo: string
    envVars: string[]       // Required environment variables
    factory: () => CloudProvider | null
}
