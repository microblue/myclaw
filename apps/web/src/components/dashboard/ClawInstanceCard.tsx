import type { FC } from 'react'
import type { Claw } from '@/ts/Interfaces'

import { clawStatus } from '@openclaw/shared'
import {
    Button,
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator
} from '@/components/ui'
import { getClawType } from '@/lib/clawTypes'
import { CircleNotchIcon } from '@phosphor-icons/react'

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

// Big card replacing the old table row. Designed for users who only
// have a handful of instances — the page should feel populated.

type Props = {
    claw: Claw
    onOpenChat: (claw: Claw) => void
    onStart: (claw: Claw) => void
    onStop: (claw: Claw) => void
    onRestart: (claw: Claw) => void
    onDelete: (claw: Claw) => void
    onDiagnose: (claw: Claw) => void
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

const ClawInstanceCard: FC<Props> = ({
    claw,
    onOpenChat,
    onStart,
    onStop,
    onRestart,
    onDelete,
    onDiagnose,
    onViewDetails
}) => {
    const clawType = getClawType(claw.clawType || 'openclaw')
    const isRunning = claw.status === clawStatus.running
    const isStopped = claw.status === clawStatus.stopped
    const isTransient = TRANSIENT_STATUSES.has(claw.status)
    const transientLabel = TRANSIENT_LABELS[claw.status]

    return (
        <div className='bg-card flex flex-col gap-4 rounded-xl border p-6 shadow-sm transition-shadow hover:shadow-md'>
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
                        <button
                            type='button'
                            onClick={() => onViewDetails(claw)}
                            className='truncate text-lg font-semibold hover:underline'
                        >
                            {claw.name}
                        </button>
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

            <div className='mt-auto flex items-center gap-2 pt-2'>
                <Button
                    className='flex-1'
                    onClick={() => onOpenChat(claw)}
                    disabled={!isRunning}
                >
                    Open Chat
                </Button>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant='outline' size='icon' aria-label='More'>
                            ⋯
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end'>
                        {isStopped ? (
                            <DropdownMenuItem onClick={() => onStart(claw)}>
                                Start
                            </DropdownMenuItem>
                        ) : (
                            <DropdownMenuItem
                                onClick={() => onStop(claw)}
                                disabled={!isRunning}
                            >
                                Pause
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                            onClick={() => onRestart(claw)}
                            disabled={!isRunning}
                        >
                            Restart
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onViewDetails(claw)}>
                            View details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDiagnose(claw)}>
                            Diagnostics
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => onDelete(claw)}
                            className='text-destructive focus:text-destructive'
                        >
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    )
}

export default ClawInstanceCard