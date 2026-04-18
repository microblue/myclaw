import type { PurchaseClawData } from '@/ts/Interfaces'

import { api } from '@/lib'
import createApiMutation from '@/hooks/createApiMutation'
import CLAWS_QUERY_KEY from '@/hooks/useClaws/CLAWS_QUERY_KEY'

// Refetch the claws list immediately after a purchase so the dashboard
// shows the new instance tile (creating state) without waiting for the
// next poll.
const usePurchaseClaw = createApiMutation(
    (data: PurchaseClawData) => api.purchaseClaw(data),
    { invalidateKeys: [CLAWS_QUERY_KEY] }
)

export default usePurchaseClaw