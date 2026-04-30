import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import CLAW_METRICS_QUERY_KEY from '@/hooks/useClaws/CLAW_METRICS_QUERY_KEY'

// 5s refetch matches what feels "live" in the UI without thrashing
// the api: each cycle costs ~2.5s (two HTTPS round trips to the
// claw with a 1s gap on the api side) so anything tighter would
// queue requests behind the previous one's tail.
const useClawMetrics = (clawId: string, enabled: boolean) => {
    return useQuery({
        queryKey: [...CLAW_METRICS_QUERY_KEY, clawId],
        queryFn: () => api.getClawMetrics(clawId),
        enabled,
        refetchInterval: 5_000,
        gcTime: 30_000
    })
}

export default useClawMetrics