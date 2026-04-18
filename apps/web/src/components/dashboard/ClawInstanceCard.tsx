import type { FC } from 'react'
import type { Claw } from '@/ts/Interfaces'

import { clawStatus } from '@openclaw/shared'
import { Button } from '@/components/ui'
import { getClawType } from '@/lib/clawTypes'
import { CircleNotchIcon, ArrowSquareOutIcon } from '@phosphor-icons/react'

const TRANSIENT_STATUSES = new Set<string>([
    clawStatus.creating,
    clawStatus.configuring,
    clawStatus.initializing,
    clawStatus.starting,
    clawStatus.stopping,
    clawStatus.restarting,
    clawStatus.rebuilding
])

const TRANSIENT_LABELS: Record<string, string> = {
    [clawStatus.creating]: 'Launching instance…',
    [clawStatus.configuring]: 'Deploying Claw…',
    [clawStatus.initializing]: 'Initializing…',
    [clawStatus.starting]: 'Starting…',
    [clawStatus.stopping]: 'Stopping…',
    [clawStatus.restarting]: 'Restarting…',
    [clawStatus.rebuilding]: 'Rebuilding…'
}

// Big card for the instance list. Two actions only: Open Chat (jumps
// straight to the OpenClaw UI in a new tab) and clicking anywhere on
// the card (or the name) to go to the /claw/:id management page.
// Start/Pause/Restart/Delete/Diagnostics all live on the detail page.

type Props = {
    claw: Claw
    onOpenChat: (claw: Claw) => void
    onViewDetails: (claw: Claw) => void
}

const statusTone = (status: string): string => {
    if (status === clawStatus.running) return 'bg-green-500'
    if (
        status === clawStatus.creating ||
        status === clawStatus.starting ||
        status === clawStatus.configuring ||
        status === clawStatus.initializing
    )
        return 'bg-amber-500 animate-pulse'
    if (status === clawStatus.stopped) return 'bg-muted-foreground'
    if (status === clawStatus.deleting) return 'bg-red-500'
    if (status === clawStatus.unreachable) return 'bg-red-500'
    return 'bg-muted'
}

const ClawInstanceCard: FC<Props> = ({ claw, onOpenChat, onViewDetails }) => {
    const clawType = getClawType(claw.clawType || 'openclaw')
    const isRunning = claw.status === clawStatus.running
    const isTransient = TRANSIENT_STATUSES.has(claw.status)
    const transientLabel = TRANSIENT_LABELS[claw.status]

    // Click anywhere on the card body (outside the primary Open Chat
    // button) navigates to the detail page — the card is essentially a
    // big link with one escape-hatch action.
    const handleCardClick = () => onViewDetails(claw)

    return (
        <div
            role='button'
            tabIndex={0}
            onClick={handleCardClick}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleCardClick()
                }
            }}
            className='bg-card flex flex-col gap-4 rounded-xl border p-6 text-left shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer'
        >
            <div className='flex items-start justify-between'>
                <div className='min-w-0'>
                    <div className='flex items-center gap-2'>
                        {isTransient ? (
                            <CircleNotchIcon
                                className='text-primary h-3 w-3 animate-spin'
                                weight='bold'
                                aria-hidden
                            />
                        ) : (
                            <span
                                className={`h-2.5 w-2.5 rounded-full ${statusTone(claw.status)}`}
                                aria-hidden
                            />
                        )}
                        <span className='truncate text-lg font-semibold'>
                            {claw.name}
                        </span>
                    </div>
                    <p className='text-muted-foreground mt-1 text-xs capitalize'>
                        {transientLabel || claw.status}
                    </p>
                </div>
                <span className='bg-muted text-muted-foreground rounded px-2 py-1 text-xs'>
                    {clawType?.name || 'OpenClaw'}
                </span>
            </div>

            <dl className='text-muted-foreground grid grid-cols-2 gap-y-2 text-xs'>
                <dt>Provider</dt>
                <dd className='text-foreground text-right capitalize'>
                    {claw.provider || '—'}
                </dd>
                <dt>Plan</dt>
                <dd className='text-foreground text-right uppercase'>
                    {claw.planId || '—'}
                </dd>
                <dt>Region</dt>
                <dd className='text-foreground text-right'>
                    {claw.location || '—'}
                </dd>
                <dt>IP</dt>
                <dd className='text-foreground text-right font-mono text-xs'>
                    {claw.ip || '—'}
                </dd>
            </dl>

            <div className='mt-auto pt-2'>
                <Button
                    className='w-full'
                    onClick={(e) => {
                        e.stopPropagation()
                        onOpenChat(claw)
                    }}
                    disabled={!isRunning}
                >
                    <ArrowSquareOutIcon
                        className='mr-1.5 h-4 w-4'
                        weight='bold'
                    />
                    Open Chat
                </Button>
            </div>
        </div>
    )
}

export default ClawInstanceCard