import type { FC } from 'react'
import type { Claw } from '@/ts/Interfaces'

import { useNavigate } from 'react-router-dom'
import { ROUTES } from '@/lib'
import { useToast } from '@/hooks'
import { Button } from '@/components/ui'
import ClawInstanceCard from '@/components/dashboard/ClawInstanceCard'

type Props = {
    claws: Claw[]
    displayName: string
}

const ClawsListView: FC<Props> = ({ claws, displayName }) => {
    const navigate = useNavigate()
    const toast = useToast()

    // Open Chat from the tile goes straight to the OpenClaw UI
    // (authenticated via ?token=) in a new tab — the management
    // buttons (Start/Pause/Restart/Delete/Diagnostics) live on the
    // /claw/:id detail page the rest of the card opens.
    const handleOpenChat = (claw: Claw) => {
        if (!claw.subdomain) {
            toast.error('This instance has no subdomain yet.')
            return
        }
        const base = `https://${claw.subdomain}.myclaw.one/`
        const url = claw.gatewayToken
            ? `${base}?token=${encodeURIComponent(claw.gatewayToken)}`
            : base
        window.open(url, '_blank', 'noopener')
    }

    const handleViewDetails = (claw: Claw) => {
        navigate(`/claw/${claw.id}`)
    }

    if (claws.length === 0) {
        return (
            <div className='mx-auto flex max-w-2xl flex-col items-center gap-4 py-16 text-center'>
                <div className='bg-muted flex h-20 w-20 items-center justify-center rounded-full text-3xl'>
                    🐾
                </div>
                <h2 className='text-2xl font-semibold'>
                    No Claws yet, {displayName || 'there'}
                </h2>
                <p className='text-muted-foreground max-w-md text-sm'>
                    Deploy your first Claw to get started. It takes a few minutes — you can pause or delete it anytime.
                </p>
                <Button onClick={() => navigate(ROUTES.NEW_CLAW)} size='lg'>
                    Deploy your first Claw
                </Button>
            </div>
        )
    }

    return (
        <div className='mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8'>
            <div className='mb-6 flex items-end justify-between gap-4'>
                <div>
                    <h2 className='text-xl font-semibold md:text-2xl'>
                        Welcome back{displayName ? `, ${displayName}` : ''}
                    </h2>
                    <p className='text-muted-foreground mt-1 text-sm'>
                        You have {claws.length} {claws.length === 1 ? 'Claw' : 'Claws'}.
                    </p>
                </div>
                <Button onClick={() => navigate(ROUTES.NEW_CLAW)}>
                    Deploy new
                </Button>
            </div>
            <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
                {claws.map((claw) => (
                    <ClawInstanceCard
                        key={claw.id}
                        claw={claw}
                        onOpenChat={handleOpenChat}
                        onViewDetails={handleViewDetails}
                    />
                ))}
            </div>
        </div>
    )
}

export default ClawsListView