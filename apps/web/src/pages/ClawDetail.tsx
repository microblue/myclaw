import type { FC } from 'react'
import type { Claw } from '@/ts/Interfaces'

import { useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { clawStatus } from '@openclaw/shared'
import { ROUTES } from '@/lib'
import { useToast } from '@/hooks'
import useClaw from '@/hooks/useClaws/useClaw'
import useStartClaw from '@/hooks/useClaws/useStartClaw'
import useStopClaw from '@/hooks/useClaws/useStopClaw'
import useRestartClaw from '@/hooks/useClaws/useRestartClaw'
import useDeleteClaw from '@/hooks/useClaws/useDeleteClaw'
import AppShell from '@/components/layout/AppShell'
import ClawLogsContent from '@/components/dashboard/ClawLogsContent'
import ClawTerminalContent from '@/components/dashboard/ClawTerminalContent'
import ClawDiagnosticsContent from '@/components/dashboard/ClawDiagnosticsContent'
import {
    Button,
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator
} from '@/components/ui'
import { getClawType } from '@/lib/clawTypes'
import { useState } from 'react'
import {
    ArrowSquareOutIcon,
    DotsThreeIcon
} from '@phosphor-icons/react'

type TabId = 'overview' | 'logs' | 'terminal' | 'diagnostics'

const TABS: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'logs', label: 'Logs' },
    { id: 'terminal', label: 'Terminal' },
    { id: 'diagnostics', label: 'Diagnostics' }
]

const ClawDetail: FC = () => {
    const { id = '' } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const toast = useToast()
    const [searchParams, setSearchParams] = useSearchParams()

    const { data: claw, isLoading, error } = useClaw(id)

    const tab: TabId =
        (searchParams.get('tab') as TabId | null) || 'overview'

    const setTab = (next: TabId) => {
        const params = new URLSearchParams(searchParams)
        params.set('tab', next)
        setSearchParams(params, { replace: true })
    }

    const start = useStartClaw()
    const stop = useStopClaw()
    const restart = useRestartClaw()
    const del = useDeleteClaw()

    const openSubdomain = () => {
        if (!claw?.subdomain) {
            toast.error('This instance has no subdomain yet.')
            return
        }
        // Append the gateway token so the OpenClaw control UI authenticates
        // automatically instead of dropping the user on the
        // "unauthorized: gateway token missing" screen.
        const base = `https://${claw.subdomain}.myclaw.one/`
        const url = claw.gatewayToken
            ? `${base}?token=${encodeURIComponent(claw.gatewayToken)}`
            : base
        window.open(url, '_blank', 'noopener')
    }

    const wrap = (label: string, fn: () => Promise<unknown>) => async () => {
        try {
            await fn()
            toast.success(label)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : `${label} failed`)
        }
    }

    if (isLoading) {
        return (
            <AppShell>
                <div className='flex h-[calc(100vh-3.5rem)] items-center justify-center'>
                    <div className='h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent opacity-50' />
                </div>
            </AppShell>
        )
    }
    if (error || !claw) {
        return (
            <AppShell>
                <div className='mx-auto max-w-lg p-10 text-center'>
                    <p className='text-destructive text-sm'>
                        Could not load this instance.
                    </p>
                    <Button
                        className='mt-4'
                        variant='outline'
                        onClick={() => navigate(ROUTES.CLAWS)}
                    >
                        Back to instances
                    </Button>
                </div>
            </AppShell>
        )
    }

    const isRunning = claw.status === clawStatus.running
    const isStopped = claw.status === clawStatus.stopped

    const actions = (
        <div className='flex items-center gap-2'>
            <Button
                size='sm'
                onClick={openSubdomain}
                disabled={!isRunning || !claw.subdomain}
            >
                <ArrowSquareOutIcon className='mr-1.5 h-4 w-4' weight='bold' />
                Open chat
            </Button>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant='outline' size='sm' aria-label='More'>
                        <DotsThreeIcon className='h-4 w-4' weight='bold' />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                    {isStopped ? (
                        <DropdownMenuItem
                            onClick={wrap('Starting', () =>
                                start.mutateAsync(claw.id)
                            )}
                        >
                            Start
                        </DropdownMenuItem>
                    ) : (
                        <DropdownMenuItem
                            onClick={wrap('Pausing', () =>
                                stop.mutateAsync(claw.id)
                            )}
                            disabled={!isRunning}
                        >
                            Pause
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                        onClick={wrap('Restarting', () =>
                            restart.mutateAsync(claw.id)
                        )}
                        disabled={!isRunning}
                    >
                        Restart
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        onClick={async () => {
                            if (!window.confirm(`Delete ${claw.name}?`)) return
                            try {
                                await del.mutateAsync(claw.id)
                                toast.success('Deletion scheduled')
                                navigate(ROUTES.CLAWS)
                            } catch (e) {
                                toast.error(
                                    e instanceof Error
                                        ? e.message
                                        : 'Delete failed'
                                )
                            }
                        }}
                        className='text-destructive focus:text-destructive'
                    >
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )

    return (
        <AppShell pageActions={actions}>
            <div className='mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8'>
                <DetailHeader claw={claw} />

                <div className='border-border -mx-4 mt-6 overflow-x-auto border-b px-4 md:-mx-6 md:px-6'>
                    <div className='flex gap-6'>
                        {TABS.map((t) => (
                            <button
                                key={t.id}
                                type='button'
                                onClick={() => setTab(t.id)}
                                className={`border-b-2 py-3 text-sm font-medium transition-colors ${
                                    tab === t.id
                                        ? 'border-primary text-foreground'
                                        : 'text-muted-foreground hover:text-foreground border-transparent'
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className='mt-6'>
                    {tab === 'overview' && <OverviewTab claw={claw} />}
                    {tab === 'logs' && (
                        <LogsTab claw={claw} />
                    )}
                    {tab === 'terminal' && (
                        <div className='bg-card rounded-lg border p-4'>
                            <ClawTerminalContent
                                clawId={claw.id}
                                enabled
                            />
                        </div>
                    )}
                    {tab === 'diagnostics' && (
                        <div className='bg-card rounded-lg border p-4'>
                            <ClawDiagnosticsContent
                                clawId={claw.id}
                                enabled
                            />
                        </div>
                    )}
                </div>
            </div>
        </AppShell>
    )
}

const DetailHeader: FC<{ claw: Claw }> = ({ claw }) => {
    const clawType = getClawType(claw.clawType || 'openclaw')
    const uptime = useMemo(() => formatUptime(claw.createdAt), [claw.createdAt])
    return (
        <div>
            <div className='flex items-center gap-3'>
                <StatusDot status={claw.status} />
                <h1 className='text-xl font-semibold md:text-2xl'>
                    {claw.name}
                </h1>
                <span className='bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs'>
                    {clawType?.name || 'OpenClaw'}
                </span>
            </div>
            <p className='text-muted-foreground mt-1 text-sm capitalize'>
                {claw.status} · uptime {uptime}
            </p>
        </div>
    )
}

const LogsTab: FC<{ claw: Claw }> = ({ claw }) => {
    // Default to bootstrap while the claw is still deploying so the user
    // sees cloud-init progress; once running, the gateway log is the
    // interesting one.
    const defaultSource: 'gateway' | 'bootstrap' =
        claw.status === clawStatus.running ? 'gateway' : 'bootstrap'
    const [source, setSource] = useState<'gateway' | 'bootstrap'>(
        defaultSource
    )
    return (
        <div className='bg-card rounded-lg border'>
            <div className='border-border flex gap-1 border-b p-1.5'>
                {(
                    [
                        { id: 'bootstrap', label: 'Bootstrap' },
                        { id: 'gateway', label: 'Gateway' }
                    ] as const
                ).map((s) => (
                    <button
                        key={s.id}
                        type='button'
                        onClick={() => setSource(s.id)}
                        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                            source === s.id
                                ? 'bg-foreground/10 text-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        {s.label}
                    </button>
                ))}
                <span className='text-muted-foreground ml-auto self-center pr-2 text-xs'>
                    {source === 'bootstrap'
                        ? '/var/log/openclaw-bootstrap.log'
                        : '/var/log/openclaw-gateway.log'}
                </span>
            </div>
            <div className='p-4'>
                <ClawLogsContent
                    clawId={claw.id}
                    enabled
                    embedded
                    source={source}
                />
            </div>
        </div>
    )
}

const OverviewTab: FC<{ claw: Claw }> = ({ claw }) => (
    <div className='space-y-6'>
        <section className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            <StatCard label='Provider' value={claw.provider || '—'} />
            <StatCard
                label='Plan'
                value={(claw.planId || '—').toUpperCase()}
            />
            <StatCard label='Region' value={claw.location || '—'} />
            <StatCard label='IP' value={claw.ip || '—'} mono />
        </section>

        <section className='bg-card space-y-4 rounded-lg border p-6'>
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
                <Row
                    label='SSH'
                    value={claw.ip ? `root@${claw.ip}` : '—'}
                    mono
                />
                <GatewayTokenRow token={claw.gatewayToken || ''} />
            </dl>
            <p className='text-muted-foreground pt-2 text-xs'>
                The gateway token authenticates you to the OpenClaw
                Control UI. "Open chat" opens the instance with the
                token already attached; you only need to copy the token
                if you want to paste it manually.
            </p>
        </section>
    </div>
)

const GatewayTokenRow: FC<{ token: string }> = ({ token }) => {
    const toast = useToast()
    const [revealed, setRevealed] = useState(false)
    if (!token) {
        return <Row label='Gateway token' value='—' />
    }
    const masked = token.slice(0, 6) + '…' + token.slice(-4)
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(token)
            toast.success('Token copied')
        } catch (_) {
            toast.error('Copy failed')
        }
    }
    return (
        <div className='flex items-center justify-between'>
            <dt className='text-muted-foreground'>Gateway token</dt>
            <dd className='flex items-center gap-2'>
                <span className='font-mono text-xs'>
                    {revealed ? token : masked}
                </span>
                <button
                    type='button'
                    onClick={() => setRevealed((r) => !r)}
                    className='text-muted-foreground hover:text-foreground text-xs underline'
                >
                    {revealed ? 'Hide' : 'Reveal'}
                </button>
                <button
                    type='button'
                    onClick={copy}
                    className='text-muted-foreground hover:text-foreground text-xs underline'
                >
                    Copy
                </button>
            </dd>
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
        <dd className={`text-foreground ${mono ? 'font-mono text-xs' : ''}`}>
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