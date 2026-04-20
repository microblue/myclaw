import type { UseClawOptions, Claw } from '@/ts/Interfaces'

import { useQuery } from '@tanstack/react-query'
import { clawStatus } from '@openclaw/shared'
import { api } from '@/lib'
import CLAW_QUERY_KEY from '@/hooks/useClaws/CLAW_QUERY_KEY'

// Statuses where the claw is mid-transition and the viewer is staring
// at the page waiting for it to settle. Poll every 5s while in one of
// these; stop polling once we're at a steady state so we don't burn
// an RPS on a running/stopped claw that doesn't need it.
const TRANSIENT_STATUSES = new Set<string>([
    clawStatus.creating,
    clawStatus.configuring,
    clawStatus.initializing,
    clawStatus.starting,
    clawStatus.stopping,
    clawStatus.restarting,
    clawStatus.rebuilding,
    clawStatus.migrating
])

type ClawResponse = { data?: Claw | null } | Claw | null | undefined

const useClaw = (id: string, options?: UseClawOptions) => {
    return useQuery({
        queryKey: [...CLAW_QUERY_KEY, id],
        queryFn: () => api.getClaw(id, options?.sync),
        enabled: !!id,
        refetchInterval: (query) => {
            const raw = query.state.data as ClawResponse
            const claw =
                raw && typeof raw === 'object' && 'data' in raw
                    ? raw.data
                    : (raw as Claw | null | undefined)
            const status = claw?.status
            return status && TRANSIENT_STATUSES.has(status) ? 5_000 : false
        }
    })
}

export default useClaw