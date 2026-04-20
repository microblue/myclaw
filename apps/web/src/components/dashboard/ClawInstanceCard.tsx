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
    [clawStatus.creating]: 'Launching your Claw…',
    [clawStatus.configuring]: 'Setting things up…',
    [clawStatus.initializing]: 'Initializing…',
    [clawStatus.starting]: 'Starting…',
    [clawStatus.stopping]: 'Pausing…',
    [clawStatus.restarting]: 'Restarting…',
    [clawStatus.rebuilding]: 'Rebuilding…'
}

// Secondary line that explains what's happening under the hood while
// the big transient label spins. Users who've watched the deploy flow
// a few times will learn to skip this, but first-timers need the
// reassurance that the 5-10 minute wait is expected.
const TRANSIENT_HINTS: Record<string, string> = {
    [clawStatus.creating]: 'Renting a server from the cloud. Usually ~30s.',
    [clawStatus.configuring]:
        'Installing OpenClaw, wiring DNS, issuing TLS cert. Usually 3-8 minutes.',
    [clawStatus.initializing]: 'Almost there — warming up the engine.',
    [clawStatus.starting]: 'Waking up from pause…',
    [clawStatus.stopping]: 'Shutting down gracefully…',
    [clawStatus.restarting]: 'Rebooting the Claw…',
    [clawStatus.rebuilding]: 'Rebuilding from scratch…'
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

    const transientHint = TRANSIENT_HINTS[claw.status]

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
            className={`bg-card relative flex flex-col gap-4 rounded-xl border p-6 text-left shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer ${isTransient ? 'overflow-hidden' : ''}`}
        >
            {/* Transient-state banner — large spinner, bold label, hint
                line. This is what the user stares at for 5+ minutes
                while a fresh Claw is bootstrapping; tiny spinner +
                muted text below the name was unmissable-by-design. */}
            {isTransient && (
                <div className='from-primary/15 via-primary/10 to-card absolute inset-x-0 top-0 z-10 flex items-center gap-3 border-b border-primary/20 bg-gradient-to-r px-6 py-3'>
                    <CircleNotchIcon
                        className='text-primary h-6 w-6 shrink-0 animate-spin'
                        weight='bold'
                        aria-hidden
                    />
                    <div className='min-w-0 flex-1'>
                        <p className='text-foreground text-sm font-semibold leading-tight'>
                            {transientLabel || 'Working…'}
                        </p>
                        {transientHint && (
                            <p className='text-muted-foreground mt-0.5 text-xs leading-tight'>
                                {transientHint}
                            </p>
                        )}
                    </div>
                </div>
            )}

            <div
                className={`flex items-start justify-between ${isTransient ? 'mt-14 opacity-60' : ''}`}
            >
                <div className='min-w-0'>
                    <div className='flex items-center gap-2'>
                        {!isTransient && (
                            <span
                                className={`h-2.5 w-2.5 rounded-full ${statusTone(claw.status)}`}
                                aria-hidden
                            />
                        )}
                        <span className='truncate text-lg font-semibold'>
                            {claw.name}
                        </span>
                    </div>
                    {!isTransient && (
                        <p className='text-muted-foreground mt-1 text-xs capitalize'>
                            {claw.status}
                        </p>
                    )}
                </div>
                <span className='bg-muted text-muted-foreground rounded px-2 py-1 text-xs'>
                    {clawType?.name || 'OpenClaw'}
                </span>
            </div>

            <dl
                className={`text-muted-foreground grid grid-cols-2 gap-y-2 text-xs ${isTransient ? 'opacity-60' : ''}`}
            >
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
                    Open chat
                </Button>
            </div>
        </div>
    )
}

export default ClawInstanceCard