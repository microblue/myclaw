import type { FC, ReactNode } from 'react'
import type {
    AdminDetailModalProps,
    AdminReferralListItem,
    BillingOrder
} from '@/ts/Interfaces'

import { Dialog, DialogContent } from '@/components/ui'
import AdminReferralDetailView from '@/components/admin/AdminReferralDetailView'
import AdminBillingDetailView from '@/components/admin/AdminBillingDetailView'
import AdminUserDetailView from '@/components/admin/AdminUserDetailView'

const AdminDetailModal: FC<AdminDetailModalProps> = ({
    entity,
    onClose,
    onNavigateToUser
}): ReactNode => {
    const renderEntityContent = () => {
        if (!entity) return null

        switch (entity.type) {
            case 'user':
                return (
                    <AdminUserDetailView userId={entity.id} onClose={onClose} />
                )
            // `claw` no longer opens in the modal — AdminClawsTab
            // navigates directly to /claw/:id so admins get the full
            // page (status actions, logs, SSH) on any user's claw.
            case 'referral':
                return (
                    <AdminReferralDetailView
                        referral={entity.data as AdminReferralListItem}
                        onClose={onClose}
                        onNavigateToUser={onNavigateToUser}
                    />
                )
            case 'billing':
                return (
                    <AdminBillingDetailView
                        order={entity.data as BillingOrder}
                        onClose={onClose}
                    />
                )
            default:
                return null
        }
    }

    return (
        <Dialog open={!!entity} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className='max-h-[85vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto'>
                {renderEntityContent()}
            </DialogContent>
        </Dialog>
    )
}

export default AdminDetailModal