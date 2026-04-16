import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'

const useProviderPlans = (providerId: string | null) => {
    const query = useQuery({
        queryKey: ['provider-plans', providerId],
        queryFn: () => api.getProviderPlans(providerId!),
        enabled: !!providerId,
        staleTime: 60_000,
        retry: false
    })

    return {
        ...query,
        plans: query.data || []
    }
}

export default useProviderPlans
