import type { FC } from 'react'
import type { Claw } from '@/ts/Interfaces'

import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { clawStatus } from '@openclaw/shared'
import { ROUTES, DASHBOARD_TABS } from '@/lib'
import { usePreferencesStore, useDashboardStore } from '@/lib/store'
import { useToast } from '@/hooks'
import useClaw from '@/hooks/useClaws/useClaw'
import useStartClaw from '@/hooks/useClaws/useStartClaw'
import useStopClaw from '@/hooks/useClaws/useStopClaw'
import useRestartClaw from '@/hooks/useClaws/useRestartClaw'
import useDeleteClaw from '@/hooks/useClaws/useDeleteClaw'
import { Button } from '@/components/ui'
import { getClawType } from '@/lib/clawTypes'

// Phase 1 "Plan C" monitoring: no provider metrics SDK yet. Shows the
// status the DB already has plus a derived uptime and the connection
// bits a user needs. Logs / terminal / diagnostics stay on the
// dashboard for now; this page is the overview.

const ClawDetail: FC = () => {
    const { id = '' } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const toast = useToast()
    const { data: claw, isLoading, error } = useClaw(id)

    const { setDashboardTab } = usePreferencesStore()
    const { setSelectedClawId, setChatSelectedAgent } = useDashboardStore()

    const start = useStartClaw()
    const stop = useStopClaw()
    const restart = useRestartClaw()
    const del = useDeleteClaw()

    if (isLoading) {
        return (
            <div className='text-muted-foreground p-10 text-center text-sm'>
                Loading instance…
            </div>
        )
    }
    if (error || !claw) {
        return (
            <div className='mx-auto max-w-lg p-10 text-center'>
                <p className='text-destructive text-sm'>
                    Could not load this instance.
                </p>
                <Button
                    className='mt-4'
                    variant='outline'
                    onClick={() => navigate(ROUTES.CLAWS)}
                >
                    Back to dashboard
                </Button>
            </div>
        )
    }

    return (
        <ClawDetailView
            claw={claw}
            onBack={() => navigate(ROUTES.CLAWS)}
            onOpenChat={() => {
                setSelectedClawId(claw.id)
                setChatSelectedAgent(null)
                setDashboardTab(DASHBOARD_TABS.CHAT)
                navigate(ROUTES.CLAWS)
            }}
            onStart={async () => {
                try {
                    await start.mutateAsync(claw.id)
                    toast.success(`Starting ${claw.name}`)
                } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Start failed')
                }
            }}
            onStop={async () => {
                try {
                    await stop.mutateAsync(claw.id)
                    toast.success(`Pausing ${claw.name}`)
                } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Pause failed')
                }
            }}
            onRestart={async () => {
                try {
                    await restart.mutateAsync(claw.id)
                    toast.success(`Restarting ${claw.name}`)
                } catch (e) {
                    toast.error(
                        e instanceof Error ? e.message : 'Restart failed'
                    )
                }
            }}
            onDelete={async () => {
                if (!window.confirm(`Delete ${claw.name}?`)) return
                try {
                    await del.mutateAsync(claw.id)
                    toast.success(`Deletion scheduled`)
                    navigate(ROUTES.CLAWS)
                } catch (e) {
                    toast.error(
                        e instanceof Error ? e.message : 'Delete failed'
                    )
                }
            }}
        />
    )
}

type ViewProps = {
    claw: Claw
    onBack: () => void
    onOpenChat: () => void
    onStart: () => void
    onStop: () => void
    onRestart: () => void
    onDelete: () => void
}

const ClawDetailView: FC<ViewProps> = ({
    claw,
    onBack,
    onOpenChat,
    onStart,
    onStop,
    onRestart,
    onDelete
}) => {
    const clawType = getClawType(claw.clawType || 'openclaw')
    const isRunning = claw.status === clawStatus.running
    const isStopped = claw.status === clawStatus.stopped

    const uptime = useMemo(() => formatUptime(claw.createdAt), [claw.createdAt])

    return (
        <div className='bg-background min-h-screen'>
            <header className='border-b'>
                <div className='mx-auto flex max-w-5xl items-center justify-between px-6 py-4'>
                    <button
                        type='button'
                        onClick={onBack}
                        className='text-muted-foreground hover:text-foreground text-sm'
                    >
                        ← Back to dashboard
                    </button>
                    <div className='flex gap-2'>
                        <Button onClick={onOpenChat} disabled={!isRunning}>
                            Open Chat
                        </Button>
                        {isStopped ? (
                            <Button variant='outline' onClick={onStart}>
                                Start
                            </Button>
                        ) : (
                            <Button
                                variant='outline'
                                onClick={onStop}
                                disabled={!isRunning}
                            >
                                Pause
                            </Button>
                        )}
                        <Button
                            variant='outline'
                            onClick={onRestart}
                            disabled={!isRunning}
                        >
                            Restart
                        </Button>
                    </div>
                </div>
            </header>

            <main className='mx-auto max-w-5xl space-y-8 px-6 py-8'>
                <section className='bg-card rounded-xl border p-6'>
                    <div className='flex items-center gap-3'>
                        <StatusDot status={claw.status} />
                        <h1 className='text-2xl font-semibold'>{claw.name}</h1>
                        <span className='bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs'>
                            {clawType?.name || 'OpenClaw'}
                        </span>
                    </div>
                    <p className='text-muted-foreground mt-1 text-sm capitalize'>
                        {claw.status} · uptime {uptime}
                    </p>
                </section>

                <section className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
                    <StatCard label='Provider' value={claw.provider || '—'} />
                    <StatCard
                        label='Plan'
                        value={(claw.planId || '—').toUpperCase()}
                    />
                    <StatCard label='Region' value={claw.location || '—'} />
                    <StatCard label='IP' value={claw.ip || '—'} mono />
                </section>

                <section className='bg-card space-y-4 rounded-xl border p-6'>
                    <h2 className='font-semibold'>Connection</h2>
                    <dl className='space-y-2 text-sm'>
                        <Row
                            label='Subdomain'
                            value={
                                claw.subdomain
                                    ? `${claw.subdomain}.myclaw.one`
                                    : '—'
                            }
                        />
                        <Row label='SSH' value={claw.ip ? `root@${claw.ip}` : '—'} mono />
                    </dl>
                    <p className='text-muted-foreground pt-2 text-xs'>
                        Detailed metrics (CPU, memory, network) land in a later
                        phase — this view currently shows the status the
                        control plane has.
                    </p>
                </section>

                <section className='border-destructive/40 rounded-xl border p-6'>
                    <h2 className='text-destructive font-semibold'>
                        Danger zone
                    </h2>
                    <p className='text-muted-foreground mt-1 text-sm'>
                        Deleting schedules the instance for removal. You can
                        undo this within 24 hours.
                    </p>
                    <Button
                        className='mt-4'
                        variant='destructive'
                        onClick={onDelete}
                    >
                        Delete instance
                    </Button>
                </section>
            </main>
        </div>
    )
}

const StatusDot: FC<{ status: string }> = ({ status }) => {
    const tone =
        status === clawStatus.running
            ? 'bg-green-500'
            : status === clawStatus.stopped
              ? 'bg-muted-foreground'
              : 'bg-amber-500 animate-pulse'
    return <span className={`h-3 w-3 rounded-full ${tone}`} aria-hidden />
}

const StatCard: FC<{ label: string; value: string; mono?: boolean }> = ({
    label,
    value,
    mono
}) => (
    <div className='bg-card rounded-lg border p-4'>
        <p className='text-muted-foreground text-xs uppercase tracking-wide'>
            {label}
        </p>
        <p
            className={`mt-1 text-lg font-semibold ${mono ? 'font-mono text-sm' : ''}`}
        >
            {value}
        </p>
    </div>
)

const Row: FC<{ label: string; value: string; mono?: boolean }> = ({
    label,
    value,
    mono
}) => (
    <div className='flex justify-between'>
        <dt className='text-muted-foreground'>{label}</dt>
        <dd
            className={`text-foreground ${mono ? 'font-mono text-xs' : ''}`}
        >
            {value}
        </dd>
    </div>
)

const formatUptime = (createdAt: string): string => {
    const ms = Date.now() - new Date(createdAt).getTime()
    if (ms < 0) return '—'
    const seconds = Math.floor(ms / 1000)
    const days = Math.floor(seconds / 86400)
    if (days >= 1) return `${days} day${days > 1 ? 's' : ''}`
    const hours = Math.floor(seconds / 3600)
    if (hours >= 1) return `${hours}h`
    const minutes = Math.floor(seconds / 60)
    return `${minutes}m`
}

export default ClawDetail