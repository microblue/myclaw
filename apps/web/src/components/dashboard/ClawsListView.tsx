import type { FC } from 'react'
import type { Claw } from '@/ts/Interfaces'

import { useNavigate } from 'react-router-dom'
import { ROUTES } from '@/lib'
import { useToast } from '@/hooks'
import useStartClaw from '@/hooks/useClaws/useStartClaw'
import useStopClaw from '@/hooks/useClaws/useStopClaw'
import useRestartClaw from '@/hooks/useClaws/useRestartClaw'
import useDeleteClaw from '@/hooks/useClaws/useDeleteClaw'
import { Button } from '@/components/ui'
import ClawInstanceCard from '@/components/dashboard/ClawInstanceCard'

type Props = {
    claws: Claw[]
    displayName: string
}

const ClawsListView: FC<Props> = ({ claws, displayName }) => {
    const navigate = useNavigate()
    const toast = useToast()

    const startMutation = useStartClaw()
    const stopMutation = useStopClaw()
    const restartMutation = useRestartClaw()
    const deleteMutation = useDeleteClaw()

    const handleOpenChat = (claw: Claw) => {
        navigate(`/claw/${claw.id}`)
    }

    const wrap = (
        label: string,
        fn: (id: string) => Promise<unknown>
    ) => async (claw: Claw) => {
        try {
            await fn(claw.id)
            toast.success(`${label} ${claw.name}`)
        } catch (err) {
            const msg = err instanceof Error ? err.message : `${label} failed`
            toast.error(msg)
        }
    }

    const handleStart = wrap('Starting', (id) => startMutation.mutateAsync(id))
    const handleStop = wrap('Pausing', (id) => stopMutation.mutateAsync(id))
    const handleRestart = wrap('Restarting', (id) =>
        restartMutation.mutateAsync(id)
    )
    const handleDelete = async (claw: Claw) => {
        if (!window.confirm(`Delete ${claw.name}? This can be undone for 24h.`)) return
        try {
            await deleteMutation.mutateAsync(claw.id)
            toast.success(`Deletion scheduled for ${claw.name}`)
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Delete failed'
            toast.error(msg)
        }
    }
    const handleViewDetails = (claw: Claw) => {
        navigate(`/claw/${claw.id}`)
    }
    // Diagnose routes to the detail page for now; a dedicated
    // diagnostics surface lives there in the site-wide redesign.
    const handleDiagnose = handleViewDetails

    if (claws.length === 0) {
        return (
            <div className='mx-auto flex max-w-2xl flex-col items-center gap-4 py-16 text-center'>
                <div className='bg-muted flex h-20 w-20 items-center justify-center rounded-full text-3xl'>
                    🐾
                </div>
                <h2 className='text-2xl font-semibold'>
                    No instances yet, {displayName || 'there'}
                </h2>
                <p className='text-muted-foreground max-w-md text-sm'>
                    Deploy your first Claw to get started. It takes a couple of minutes and you can pause or delete it whenever.
                </p>
                <Button onClick={() => navigate(ROUTES.NEW_CLAW)} size='lg'>
                    Deploy your first Claw
                </Button>
            </div>
        )
    }

    return (
        <div className='mx-auto w-full max-w-5xl px-6 py-8'>
            <div className='mb-6 flex items-center justify-between'>
                <div>
                    <h2 className='text-2xl font-semibold'>
                        Welcome back{displayName ? `, ${displayName}` : ''}
                    </h2>
                    <p className='text-muted-foreground mt-1 text-sm'>
                        You have {claws.length} {claws.length === 1 ? 'instance' : 'instances'}.
                    </p>
                </div>
                <Button onClick={() => navigate(ROUTES.NEW_CLAW)}>
                    Deploy new
                </Button>
            </div>
            <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3'>
                {claws.map((claw) => (
                    <ClawInstanceCard
                        key={claw.id}
                        claw={claw}
                        onOpenChat={handleOpenChat}
                        onStart={handleStart}
                        onStop={handleStop}
                        onRestart={handleRestart}
                        onDelete={handleDelete}
                        onDiagnose={handleDiagnose}
                        onViewDetails={handleViewDetails}
                    />
                ))}
            </div>
        </div>
    )
}

export default ClawsListView