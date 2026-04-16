import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'

const useProviderAvailability = (providerId: string | null) => {
    const query = useQuery({
        queryKey: ['provider-availability', providerId],
        queryFn: () => api.getProviderAvailability(providerId!),
        enabled: !!providerId,
        staleTime: 60_000,
        retry: false
    })

    return {
        ...query,
        availability: query.data || {}
    }
}

export default useProviderAvailability
