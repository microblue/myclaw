import type {
    ProviderInfo,
    ProviderPlan,
    ProviderLocation,
    VolumePricing
} from '@/ts/Interfaces'

import { client } from '@/lib/api/client'

const providers = {
    getProviders: () => 
        client.get<{ id: string; name: string; description: string; logo: string }[]>('/providers'),
    
    getProviderInfo: (providerId: string) =>
        client.get<ProviderInfo>(`/providers/${providerId}`),
    
    getProviderPlans: (providerId: string) =>
        client.get<ProviderPlan[]>(`/providers/${providerId}/plans`),
    
    getProviderLocations: (providerId: string) =>
        client.get<ProviderLocation[]>(`/providers/${providerId}/locations`),
    
    getProviderAvailability: (providerId: string) =>
        client.get<Record<string, string[]>>(`/providers/${providerId}/availability`),
    
    getProviderVolumePricing: (providerId: string) =>
        client.get<VolumePricing>(`/providers/${providerId}/volume-pricing`)
}

export default providers
