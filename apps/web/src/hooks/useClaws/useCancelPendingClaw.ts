import type { Claw } from '@/ts/Interfaces'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib'
import CLAWS_QUERY_KEY from '@/hooks/useClaws/CLAWS_QUERY_KEY'

const useCancelPendingClaw = () => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (pendingId: string) => api.cancelPendingClaw(pendingId),
        onSuccess: (_response, pendingId) => {
            queryClient.setQueryData<Claw[]>(CLAWS_QUERY_KEY, (old) =>
                old?.filter((c) => c.id !== `pending-${pendingId}`)
            )
        }
    })
}

export default useCancelPendingClaw