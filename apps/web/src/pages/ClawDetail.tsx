import type { FC } from 'react'
import type { Claw } from '@/ts/Interfaces'

import { useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { clawStatus } from '@openclaw/shared'
import { ROUTES, api } from '@/lib'
import { useToast } from '@/hooks'
import useClaw from '@/hooks/useClaws/useClaw'
import useStartClaw from '@/hooks/useClaws/useStartClaw'
import useStopClaw from '@/hooks/useClaws/useStopClaw'
import useRestartClaw from '@/hooks/useClaws/useRestartClaw'
import useDeleteClaw from '@/hooks/useClaws/useDeleteClaw'
import AppShell from '@/components/layout/AppShell'
import ClawLogsContent from '@/components/dashboard/ClawLogsContent'
import ClawMetricsTiles from '@/components/dashboard/ClawMetricsTiles'
import ClawTerminalContent from '@/components/dashboard/ClawTerminalContent'
import { Button } from '@/components/ui'
import { getClawType } from '@/lib/clawTypes'
import { buildClawChatUrl, buildClawWizardUrl, chatEntryHint } from '@/lib/clawUrl'
import { useState } from 'react'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'

type TabId = 'overview' | 'logs' | 'ssh'

const TABS: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'logs', label: 'Logs' },
    { id: 'ssh', label: 'SSH' }
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
        const url = claw ? buildClawChatUrl(claw) : null
        if (!url) {
            toast.error('This instance has no subdomain yet.')
            return
        }
        window.open(url, '_blank', 'noopener')
    }

    const openWizard = () => {
        const url = claw ? buildClawWizardUrl(claw) : null
        if (!url) {
            toast.error('Easy Setup is only available for OpenClaw instances.')
            return
        }
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

    // SSH can work any time port 22 is up on the VPS, which is true
    // from the first minute of cloud-init — no need to wait for
    // gateway/chat to be ready. That's especially important for
    // diagnosing a claw stuck in `configuring`: you open the SSH
    // tab exactly because something didn't finish.
    const canSsh = Boolean(claw.ip && claw.hasRootPassword)

    const handleDelete = async () => {
        if (!window.confirm(`Delete ${claw.name}?`)) return
        try {
            await del.mutateAsync(claw.id)
            toast.success('Deletion scheduled')
            navigate(ROUTES.CLAWS)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Delete failed')
        }
    }

    const actionBar = (
        <div className='flex flex-wrap items-center gap-2'>
            <Button
                onClick={openWizard}
                disabled={
                    !isRunning ||
                    !claw.subdomain ||
                    (claw.clawType || 'openclaw') !== 'openclaw' ||
                    !claw.gatewayToken
                }
            >
                <ArrowSquareOutIcon className='mr-1.5 h-4 w-4' weight='bold' />
                Easy Setup
            </Button>
            <Button
                variant='outline'
                onClick={openSubdomain}
                disabled={!isRunning || !claw.subdomain}
            >
                <ArrowSquareOutIcon className='mr-1.5 h-4 w-4' weight='bold' />
                Open chat
            </Button>
            {isStopped ? (
                <Button
                    variant='outline'
                    onClick={wrap('Starting', () => start.mutateAsync(claw.id))}
                >
                    Start
                </Button>
            ) : (
                <Button
                    variant='outline'
                    onClick={wrap('Pausing', () => stop.mutateAsync(claw.id))}
                    disabled={!isRunning}
                >
                    Pause
                </Button>
            )}
            <Button
                variant='outline'
                onClick={wrap('Restarting', () => restart.mutateAsync(claw.id))}
                disabled={!isRunning}
            >
                Restart
            </Button>
            <div className='flex-1' />
            <Button variant='destructive' onClick={handleDelete}>
                Delete
            </Button>
        </div>
    )

    return (
        <AppShell>
            <div className='mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8'>
                <DetailHeader claw={claw} />

                <div className='mt-6'>{actionBar}</div>

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
                    {tab === 'ssh' && (
                        <div className='bg-card rounded-lg border p-0 overflow-hidden'>
                            <div className='border-border text-muted-foreground border-b px-4 py-2 text-xs'>
                                Logged in as <span className='font-mono'>root@{claw.ip || '—'}</span> via secure WebSocket.
                            </div>
                            <div className='h-[28rem]'>
                                <ClawTerminalContent
                                    clawId={claw.id}
                                    enabled={canSsh}
                                />
                            </div>
                            {!canSsh && (
                                <div className='text-muted-foreground border-t px-4 py-3 text-xs'>
                                    SSH becomes available once the instance has a public IP and root password provisioned (usually within the first minute of setup).
                                </div>
                            )}
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
                <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${clawType?.badgeClass || 'bg-muted text-muted-foreground'}`}
                >
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
        <div className='bg-card flex h-[32rem] flex-col rounded-lg border'>
            <div className='border-border flex shrink-0 gap-1 border-b p-1.5'>
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
            {/* flex-1 + min-h-0 is what lets the inner scroller actually
                overflow instead of growing the card — Tailwind's default
                min-height on flex children is auto, which breaks clipping. */}
            <div className='flex min-h-0 flex-1 flex-col'>
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
        <ClawMetricsTiles
            clawId={claw.id}
            enabled={claw.status === clawStatus.running}
        />

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
                    label='Chat URL'
                    value={
                        claw.subdomain
                            ? `${claw.subdomain}.myclaw.one`
                            : '—'
                    }
                />
            </dl>
            <p className='text-muted-foreground pt-1 text-xs'>
                {chatEntryHint(claw)}
            </p>
        </section>

        <AdvancedSection claw={claw} />
    </div>
)

const AdvancedSection: FC<{ claw: Claw }> = ({ claw }) => {
    const [open, setOpen] = useState(false)
    return (
        <section className='bg-card rounded-lg border p-6'>
            <button
                type='button'
                onClick={() => setOpen((v) => !v)}
                className='flex w-full items-center justify-between text-left'
            >
                <div>
                    <h2 className='font-semibold'>Advanced</h2>
                    <p className='text-muted-foreground text-xs'>
                        SSH access, gateway token, and other technical
                        details.
                    </p>
                </div>
                <span className='text-muted-foreground text-xs'>
                    {open ? 'Hide' : 'Show'}
                </span>
            </button>
            {open && (
                <div className='border-border mt-4 space-y-4 border-t pt-4'>
                    <SshAccess claw={claw} />
                    <GatewayTokenRow token={claw.gatewayToken || ''} />
                </div>
            )}
        </section>
    )
}

const SshAccess: FC<{ claw: Claw }> = ({ claw }) => {
    const toast = useToast()
    const credsQuery = useQuery({
        queryKey: ['clawCredentials', claw.id],
        queryFn: () => api.getClawCredentials(claw.id),
        staleTime: 60_000
    })
    const [pwVisible, setPwVisible] = useState(false)
    const sshCmd = claw.ip ? `ssh root@${claw.ip}` : '—'
    const copy = async (text: string, label: string) => {
        try {
            await navigator.clipboard.writeText(text)
            toast.success(`${label} copied`)
        } catch (_) {
            toast.error('Copy failed')
        }
    }
    return (
        <div className='space-y-3'>
            <h3 className='text-sm font-medium'>SSH access</h3>
            <div className='flex items-center justify-between text-sm'>
                <dt className='text-muted-foreground'>Command</dt>
                <dd className='flex items-center gap-2'>
                    <code className='bg-muted rounded px-2 py-0.5 font-mono text-xs'>
                        {sshCmd}
                    </code>
                    <button
                        type='button'
                        onClick={() => copy(sshCmd, 'Command')}
                        className='text-muted-foreground hover:text-foreground text-xs underline'
                        disabled={!claw.ip}
                    >
                        Copy
                    </button>
                </dd>
            </div>
            <div className='flex items-center justify-between text-sm'>
                <dt className='text-muted-foreground'>Root password</dt>
                <dd className='flex items-center gap-2'>
                    <span className='font-mono text-xs'>
                        {credsQuery.isPending
                            ? 'Loading…'
                            : pwVisible
                              ? credsQuery.data?.rootPassword || '—'
                              : '••••••••••'}
                    </span>
                    <button
                        type='button'
                        onClick={() => setPwVisible((v) => !v)}
                        className='text-muted-foreground hover:text-foreground text-xs underline'
                        disabled={!credsQuery.data?.rootPassword}
                    >
                        {pwVisible ? 'Hide' : 'Reveal'}
                    </button>
                    <button
                        type='button'
                        onClick={() =>
                            copy(
                                credsQuery.data?.rootPassword || '',
                                'Password'
                            )
                        }
                        className='text-muted-foreground hover:text-foreground text-xs underline'
                        disabled={!credsQuery.data?.rootPassword}
                    >
                        Copy
                    </button>
                </dd>
            </div>
        </div>
    )
}

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