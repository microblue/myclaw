import type { FirebaseUser } from '@/ts/Interfaces'

import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

const usePlans = (user: FirebaseUser | null, provider?: string) => {
    return useQuery({
        queryKey: ['plans', provider],
        queryFn: () => api.getPlans(provider),
        enabled: !!user
    })
}

export default usePlans