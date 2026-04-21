import type { FC } from 'react'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { t } from '@openclaw/i18n'
import { api } from '@/lib'
import {
    useAdminUsers,
    useDebouncedValue,
    useToast
} from '@/hooks'
import CLAW_QUERY_KEY from '@/hooks/useClaws/CLAW_QUERY_KEY'
import {
    Button,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    Input
} from '@/components/ui'
import { MagnifyingGlassIcon, UserIcon } from '@phosphor-icons/react'

// Admin-only modal: search any user by email/name and reassign a
// claw's `userId` to them. The underlying Polar subscription stays on
// the claw, so the new owner inherits billing — that's the intended
// semantics of an ownership transfer.

interface Props {
    clawId: string
    currentOwnerEmail: string | null | undefined
    currentOwnerUserId: string
    open: boolean
    onClose: () => void
}

const AdminClawOwnerPicker: FC<Props> = ({
    clawId,
    currentOwnerEmail,
    currentOwnerUserId,
    open,
    onClose
}) => {
    const toast = useToast()
    const qc = useQueryClient()
    const [search, setSearch] = useState('')
    const debounced = useDebouncedValue(search, 300)

    const { data, isLoading } = useAdminUsers(20, debounced || undefined)
    const users = data?.pages.flatMap((p) => p.items) || []

    const reassign = useMutation({
        mutationFn: ({ userId }: { userId: string; email: string }) =>
            api.reassignAdminClawOwner(clawId, userId),
        onSuccess: (_res, vars) => {
            qc.invalidateQueries({ queryKey: [...CLAW_QUERY_KEY, clawId] })
            toast.success(
                `${t('api.clawOwnerUpdated')} → ${vars.email}`
            )
            onClose()
        },
        onError: (err: unknown) => {
            toast.error(
                err instanceof Error
                    ? err.message
                    : t('api.failedToReassignClaw')
            )
        }
    })

    const handlePick = (userId: string, email: string) => {
        if (userId === currentOwnerUserId) {
            toast.info(t('api.clawOwnerUnchanged'))
            return
        }
        const confirmed = window.confirm(
            `Transfer this Claw from ${currentOwnerEmail || '(unknown)'} to ${email}?\n\nThe Polar subscription stays attached — the new owner inherits billing.`
        )
        if (!confirmed) return
        reassign.mutate({ userId, email })
    }

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className='max-h-[80vh] w-[calc(100vw-2rem)] max-w-lg overflow-hidden'>
                <DialogHeader>
                    <DialogTitle>Change owner</DialogTitle>
                </DialogHeader>

                <div className='relative'>
                    <MagnifyingGlassIcon className='text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2' />
                    <Input
                        autoFocus
                        placeholder='Search by email or name…'
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className='pl-9'
                    />
                </div>

                <div className='-mx-2 mt-2 max-h-[50vh] space-y-1 overflow-y-auto px-2'>
                    {isLoading && users.length === 0 && (
                        <div className='text-muted-foreground py-8 text-center text-sm'>
                            Loading…
                        </div>
                    )}
                    {!isLoading && users.length === 0 && (
                        <div className='text-muted-foreground py-8 text-center text-sm'>
                            No users match.
                        </div>
                    )}
                    {users.map((u) => {
                        const isCurrent = u.id === currentOwnerUserId
                        return (
                            <button
                                key={u.id}
                                type='button'
                                disabled={isCurrent || reassign.isPending}
                                onClick={() => handlePick(u.id, u.email)}
                                className={`flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors ${
                                    isCurrent
                                        ? 'bg-foreground/5 cursor-not-allowed opacity-60'
                                        : 'hover:bg-foreground/10'
                                }`}
                            >
                                <div className='bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-full'>
                                    <UserIcon className='text-muted-foreground h-4 w-4' />
                                </div>
                                <div className='min-w-0 flex-1'>
                                    <div className='truncate text-sm font-medium'>
                                        {u.name || u.email}
                                    </div>
                                    <div className='text-muted-foreground truncate font-mono text-xs'>
                                        {u.email}
                                    </div>
                                </div>
                                {isCurrent && (
                                    <span className='text-muted-foreground shrink-0 text-xs'>
                                        current
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>

                <div className='flex justify-end pt-2'>
                    <Button variant='ghost' onClick={onClose}>
                        Cancel
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export default AdminClawOwnerPicker