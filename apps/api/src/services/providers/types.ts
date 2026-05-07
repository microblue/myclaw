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
 * Provider kind discriminator. Per docs/aios-design.md §10, AI-OS
 * runs on either a long-lived VM (Hetzner / Lightsail / DigitalOcean
 * — full systemd, durable disk, hours-to-minutes provisioning) or a
 * container managed by a platform like Fly.io (sub-90-second cold
 * start, ephemeral root, persistent volume mount). Both are valid
 * deployment surfaces for the same install-claw.sh; the provisioning
 * flow chooses based on the SKU's configured provider.
 *
 * Code that only cares "did the provider boot a server?" can keep
 * using the unified CloudProvider type. Code that needs to do
 * provider-kind-specific things (e.g. credit-based metering, image
 * pre-warm) narrows on `kind`.
 */
export type ProviderKind = 'vm' | 'container'

/**
 * CloudProvider Interface
 *
 * All cloud providers must implement this interface to be usable
 * in the MyClaw platform. Implementations declare `kind` so call
 * sites can distinguish VM-style providers (Hetzner/Lightsail/DO)
 * from container-style providers (Fly).
 */
export interface CloudProvider {
    // Provider metadata
    readonly providerId: string
    readonly providerName: string
    readonly kind: ProviderKind
    getProviderInfo(): ProviderInfo

    // Server operations. locationId is optional for providers with a
    // global API (Hetzner, DigitalOcean) but required in practice for
    // Lightsail where every instance lives in a single region and the
    // AWS SDK client has to be pointed at that region.
    createServer(options: CreateServerOptions): Promise<CreateServerResult>
    getServer(serverId: string, locationId?: string): Promise<ServerStatus>
    getServers(): Promise<Map<string, ServerStatus>>
    startServer(serverId: string, locationId?: string): Promise<void>
    stopServer(serverId: string, locationId?: string): Promise<void>
    restartServer(serverId: string, locationId?: string): Promise<void>
    deleteServer(serverId: string, locationId?: string): Promise<void>

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
 * Narrowed types for callers that need provider-kind-specific logic.
 * Both still satisfy CloudProvider; the discriminator is `kind`. Use
 * these in places where the call site genuinely cares — most of the
 * provisioning pipeline operates on the union and works unchanged.
 */
export interface VMProvider extends CloudProvider {
    readonly kind: 'vm'
}

export interface ContainerProvider extends CloudProvider {
    readonly kind: 'container'
    // Image-based provisioning. The container provider boots the
    // pre-built openclaw-aios image rather than running cloud-init,
    // so the installer call (curl|bash) happens at image-build time
    // not boot time. Per-instance config still flows in as env vars
    // (the same set install-claw.sh expects: ROOT_PASSWORD, SUBDOMAIN,
    // DOMAIN, GATEWAY_TOKEN, CONFIG_JSON_B64, optional IE/IT/IR).
    readonly image: string
    // Optional: container providers may want to surface a credit
    // meter so credit-based SKUs can be priced by the second.
    getUsageCredits?(serverId: string): Promise<{ creditsRemaining: number }>
}

export const isContainerProvider = (
    p: CloudProvider
): p is ContainerProvider => p.kind === 'container'

export const isVMProvider = (p: CloudProvider): p is VMProvider =>
    p.kind === 'vm'

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