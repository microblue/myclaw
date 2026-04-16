import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import PROVIDERS_QUERY_KEY from './PROVIDERS_QUERY_KEY'

const useProviders = () => {
    const query = useQuery({
        queryKey: PROVIDERS_QUERY_KEY,
        queryFn: api.getProviders,
        staleTime: 5 * 60 * 1000,  // 5 minutes
        retry: false
    })

    return {
        ...query,
        providers: query.data || []
    }
}

export default useProviders
