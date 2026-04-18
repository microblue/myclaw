import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'

const useProviderVolumePricing = (providerId: string | null) => {
    const query = useQuery({
        queryKey: ['provider-volume-pricing', providerId],
        queryFn: () => api.getProviderVolumePricing(providerId!),
        enabled: !!providerId,
        staleTime: 5 * 60_000,
        retry: false
    })

    return {
        ...query,
        volumePricing: query.data || null
    }
}

export default useProviderVolumePricing