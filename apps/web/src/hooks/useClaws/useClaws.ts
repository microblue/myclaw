import { useQuery } from '@tanstack/react-query'
import { clawStatus } from '@openclaw/shared'
import { api } from '@/lib'
import CLAWS_QUERY_KEY from '@/hooks/useClaws/CLAWS_QUERY_KEY'

// Transient statuses where we want faster polling so the UI animates
// through the provisioning lifecycle rather than lagging 30s behind.
const TRANSIENT_STATUSES = new Set<string>([
    clawStatus.creating,
    clawStatus.configuring,
    clawStatus.initializing,
    clawStatus.starting,
    clawStatus.stopping,
    clawStatus.restarting,
    clawStatus.rebuilding,
    clawStatus.migrating,
    clawStatus.deleting
])

const useClaws = () => {
    return useQuery({
        queryKey: CLAWS_QUERY_KEY,
        queryFn: () => api.getClaws(),
        placeholderData: (previousData) => previousData,
        refetchInterval: (query) => {
            const data = query.state.data
            const anyTransient = data?.some((c) => TRANSIENT_STATUSES.has(c.status))
            return anyTransient ? 4_000 : 30_000
        }
    })
}

export default useClaws