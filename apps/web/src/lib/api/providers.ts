import type {
    ProviderInfo,
    ProviderPlan,
    ProviderLocation,
    VolumePricing
} from '@/ts/Interfaces'

import { apiPaths as API_PATHS } from '@openclaw/shared'
import { client } from '@/lib/api/client'

const providers = {
    getProviders: () =>
        client.get<{ id: string; name: string; description: string; logo: string }[]>(
            API_PATHS.PROVIDERS.BASE
        ),

    getProviderInfo: (providerId: string) =>
        client.get<ProviderInfo>(API_PATHS.PROVIDERS.byId(providerId)),

    getProviderPlans: (providerId: string) =>
        client.get<ProviderPlan[]>(API_PATHS.PROVIDERS.PLANS(providerId)),

    getProviderCuratedPlans: (providerId: string) =>
        client.get<ProviderPlan[]>(
            API_PATHS.PROVIDERS.CURATED_PLANS(providerId)
        ),

    getProviderLocations: (providerId: string) =>
        client.get<ProviderLocation[]>(
            API_PATHS.PROVIDERS.LOCATIONS(providerId)
        ),

    getProviderAvailability: (providerId: string) =>
        client.get<Record<string, string[]>>(
            API_PATHS.PROVIDERS.AVAILABILITY(providerId)
        ),

    getProviderVolumePricing: (providerId: string) =>
        client.get<VolumePricing>(
            API_PATHS.PROVIDERS.VOLUME_PRICING(providerId)
        )
}

export default providers