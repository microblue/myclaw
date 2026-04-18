import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import CLAW_LOGS_QUERY_KEY from '@/hooks/useClaws/CLAW_LOGS_QUERY_KEY'

type LogSource = 'gateway' | 'bootstrap'

const useClawLogs = (
    clawId: string,
    enabled: boolean,
    source: LogSource = 'gateway'
) => {
    return useQuery({
        queryKey: [...CLAW_LOGS_QUERY_KEY, clawId, source],
        queryFn: () =>
            source === 'bootstrap'
                ? api.getClawBootstrapLog(clawId)
                : api.getClawLogs(clawId),
        enabled,
        refetchInterval: 10_000,
        gcTime: 30_000
    })
}

export default useClawLogs