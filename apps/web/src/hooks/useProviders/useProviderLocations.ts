import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'

const useProviderLocations = (providerId: string | null) => {
    const query = useQuery({
        queryKey: ['provider-locations', providerId],
        queryFn: () => api.getProviderLocations(providerId!),
        enabled: !!providerId,
        staleTime: 60_000,
        retry: false
    })

    return {
        ...query,
        locations: query.data || []
    }
}

export default useProviderLocations
