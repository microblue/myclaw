import type { FC } from 'react'

import { useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
    SparkleIcon,
    CheckCircleIcon,
    CircleNotchIcon,
    CircleIcon,
    WarningCircleIcon,
    HardDrivesIcon,
    CpuIcon,
    LightningIcon,
    ShieldCheckIcon,
    GlobeIcon,
    BrainIcon,
    DownloadSimpleIcon,
    DatabaseIcon
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { PageTitle } from '@/components'
import { Button } from '@/components/ui'
import useClaw from '@/hooks/useClaws/useClaw'
import useInstallPhaseSubscription from '@/hooks/useInstallPhaseSubscription'

// Full-screen "Setup MyClaw.One AI OS" page. Mimics the cadence of a
// classic OS installer (Windows OOBE / Ubuntu Ubiquity): fixed left
// rail with phase checklist, big center stage with an animated icon
// + label + "this won't take long" reassurance, subtle log readout
// at the bottom. AppShell sidebar is intentionally NOT rendered —
// the installer takes the whole viewport so the user has no other
// option to click while the AI OS comes up.

interface PhaseDef {
    key: string
    label: string
    icon: Icon
    detail: string
}

const PHASE_STEPS: PhaseDef[] = [
    {
        key: 'renting_compute',
        label: 'Allocating compute',
        icon: CpuIcon,
        detail: 'Reserving your private machine'
    },
    {
        key: 'mounting_storage',
        label: 'Mounting storage',
        icon: HardDrivesIcon,
        detail: 'Setting up persistent disk'
    },
    {
        key: 'installing_kernel',
        label: 'Installing AI OS kernel',
        icon: DownloadSimpleIcon,
        detail: 'Pulling base packages'
    },
    {
        key: 'pulling_image',
        label: 'Pulling container image',
        icon: DatabaseIcon,
        detail: 'Downloading your runtime'
    },
    {
        key: 'wiring_network',
        label: 'Wiring network',
        icon: GlobeIcon,
        detail: 'Routing your subdomain'
    },
    {
        key: 'issuing_certificate',
        label: 'Issuing TLS certificate',
        icon: ShieldCheckIcon,
        detail: 'Securing your endpoint'
    },
    {
        key: 'loading_skills',
        label: 'Loading skills',
        icon: LightningIcon,
        detail: 'Installing tools your agents will use'
    },
    {
        key: 'calibrating_agents',
        label: 'Calibrating agents',
        icon: BrainIcon,
        detail: 'Tuning the orchestrator'
    },
    {
        key: 'ready',
        label: 'Ready',
        icon: SparkleIcon,
        detail: "You're set."
    }
]

const PHASE_INDEX = new Map(PHASE_STEPS.map((s, i) => [s.key, i]))

interface ClawResponse {
    id: string
    name: string
    status: string
    installRunId: string | null
}

const Progress: FC = () => {
    const { id: clawId = '' } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const clawQuery = useClaw(clawId)

    const raw = clawQuery.data as
        | { data?: ClawResponse | null }
        | ClawResponse
        | null
        | undefined
    const claw =
        raw && typeof raw === 'object' && 'data' in raw
            ? raw.data
            : (raw as ClawResponse | null | undefined)

    const installRunId = claw?.installRunId ?? null

    const { rows, latestPhase, connected, error } =
        useInstallPhaseSubscription({
            clawId: clawId || null,
            installRunId,
            enabled: !!clawId && !!installRunId
        })

    // On `ready`, give the success animation 1.5s to land then
    // hand off to the AI OS detail page. `replace: true` so the
    // back button doesn't bounce them back here.
    useEffect(() => {
        if (latestPhase === 'ready') {
            const timer = setTimeout(() => {
                navigate(`/aios/${clawId}`, { replace: true })
            }, 1800)
            return () => clearTimeout(timer)
        }
        return undefined
    }, [latestPhase, clawId, navigate])

    const failed = latestPhase === 'failed'
    const isReady = latestPhase === 'ready'

    const currentIdx = useMemo(() => {
        if (!latestPhase || latestPhase === 'failed') return -1
        return PHASE_INDEX.get(latestPhase) ?? -1
    }, [latestPhase])

    const currentPhase = currentIdx >= 0 ? PHASE_STEPS[currentIdx] : null

    const logTail = useMemo(() => {
        const lines = rows
            .map((r) => r.logChunk)
            .filter(Boolean)
            .join('\n')
            .split('\n')
        return lines.slice(-12).join('\n')
    }, [rows])

    if (!clawId) {
        return (
            <div className='flex min-h-screen items-center justify-center bg-background'>
                <p className='text-destructive'>Missing instance id.</p>
            </div>
        )
    }

    return (
        <div className='bg-background relative flex min-h-screen flex-col overflow-hidden'>
            <PageTitle title='Setting up your AI OS' noIndex />

            {/* Layered animated background: deep gradient + slow-rotating
                radial gradient. Cheap (CSS only) but gives the screen
                weight without a busy animation. */}
            <div className='pointer-events-none absolute inset-0'>
                <div className='from-primary/10 absolute inset-0 bg-gradient-to-br via-transparent to-transparent' />
                <div className='absolute -left-1/4 -top-1/4 h-[60vw] w-[60vw] rounded-full bg-gradient-radial from-primary/20 via-primary/5 to-transparent blur-3xl animate-pulse-slow' />
                <div className='absolute -bottom-1/4 -right-1/4 h-[60vw] w-[60vw] rounded-full bg-gradient-radial from-emerald-500/10 via-emerald-500/5 to-transparent blur-3xl' />
            </div>

            <header className='relative z-10 flex items-center justify-between px-6 py-5 md:px-10'>
                <div className='flex items-center gap-3'>
                    <div className='from-primary/40 to-primary/10 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br shadow-md'>
                        <SparkleIcon
                            className='text-primary h-5 w-5'
                            weight='fill'
                        />
                    </div>
                    <div>
                        <div className='text-xs font-medium uppercase tracking-wider text-muted-foreground'>
                            MyClaw.One
                        </div>
                        <div className='text-sm font-semibold leading-tight'>
                            AI OS Setup
                        </div>
                    </div>
                </div>

                {!failed && !isReady && (
                    <div className='text-muted-foreground hidden items-center gap-2 text-xs md:flex'>
                        <span
                            className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`}
                        />
                        {connected ? 'Live updates connected' : 'Reconnecting…'}
                    </div>
                )}
            </header>

            <main className='relative z-10 flex flex-1 items-center px-6 pb-10 md:px-10'>
                <div className='mx-auto grid w-full max-w-6xl gap-10 md:grid-cols-[280px_1fr] md:gap-14'>
                    {/* Phase rail (left) */}
                    <aside className='order-2 md:order-1'>
                        <div className='text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4'>
                            Steps
                        </div>
                        <ol className='space-y-2'>
                            {PHASE_STEPS.map((step, idx) => {
                                const state = failed
                                    ? idx <= currentIdx
                                        ? 'failed'
                                        : 'pending'
                                    : idx < currentIdx
                                      ? 'done'
                                      : idx === currentIdx
                                        ? 'active'
                                        : 'pending'
                                return (
                                    <li
                                        key={step.key}
                                        className={`flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors ${
                                            state === 'active'
                                                ? 'bg-primary/10'
                                                : ''
                                        }`}
                                    >
                                        <PhaseDot state={state} />
                                        <span
                                            className={
                                                state === 'pending'
                                                    ? 'text-muted-foreground/60 text-sm'
                                                    : state === 'active'
                                                      ? 'text-foreground text-sm font-medium'
                                                      : state === 'failed'
                                                        ? 'text-destructive text-sm font-medium'
                                                        : 'text-foreground/80 text-sm'
                                            }
                                        >
                                            {step.label}
                                        </span>
                                    </li>
                                )
                            })}
                        </ol>
                    </aside>

                    {/* Center stage */}
                    <section className='order-1 flex flex-col items-center justify-center text-center md:order-2 md:items-start md:text-left'>
                        {failed ? (
                            <FailedStage
                                onBack={() => navigate('/aios')}
                                onRetry={() => clawQuery.refetch()}
                            />
                        ) : isReady ? (
                            <ReadyStage clawName={claw?.name ?? ''} />
                        ) : (
                            <ActiveStage
                                phase={currentPhase}
                                clawName={claw?.name ?? ''}
                            />
                        )}

                        {error && !failed && (
                            <div className='border-destructive/40 bg-destructive/5 text-destructive mt-6 max-w-md rounded-lg border p-3 text-sm'>
                                Live updates dropped: {error.message}. The
                                setup is still running — refresh in a moment.
                            </div>
                        )}
                    </section>
                </div>
            </main>

            {/* Log readout — collapsed by default; subtle so it
                doesn't dominate but power users can scan it. */}
            {logTail && !isReady && (
                <details className='relative z-10 mx-6 mb-6 md:mx-10'>
                    <summary className='text-muted-foreground hover:text-foreground inline-flex cursor-pointer select-none items-center gap-1.5 text-xs transition-colors'>
                        <span className='border-current opacity-60'>›</span>
                        Show install log
                    </summary>
                    <pre className='bg-foreground/5 text-muted-foreground mt-2 max-h-48 overflow-auto rounded-lg p-4 text-[11px] leading-relaxed'>
                        {logTail}
                    </pre>
                </details>
            )}
        </div>
    )
}

const ActiveStage: FC<{
    phase: PhaseDef | null
    clawName: string
}> = ({ phase, clawName }) => {
    const Icon = phase?.icon ?? CircleNotchIcon
    return (
        <>
            <div className='from-primary/30 to-primary/5 mb-8 flex h-28 w-28 items-center justify-center rounded-3xl bg-gradient-to-br shadow-2xl shadow-primary/20'>
                <div className='from-primary/50 to-primary/20 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br'>
                    <Icon
                        className='text-primary-foreground h-10 w-10'
                        weight='fill'
                    />
                </div>
            </div>
            <h1 className='text-3xl font-semibold tracking-tight md:text-5xl'>
                {phase?.label ?? 'Getting ready…'}
            </h1>
            <p className='text-muted-foreground mt-3 max-w-md text-base'>
                {phase?.detail ??
                    'Connecting to the provisioner. This will only take a moment.'}
            </p>
            <p className='text-muted-foreground/70 mt-8 max-w-md text-sm'>
                {clawName ? (
                    <>
                        Setting up{' '}
                        <span className='text-foreground font-medium'>
                            {clawName}
                        </span>
                        .
                    </>
                ) : (
                    'Setting up your AI OS.'
                )}{' '}
                Average time: 2–3 minutes. You can close this tab — we'll
                email you when it's ready.
            </p>
        </>
    )
}

const ReadyStage: FC<{ clawName: string }> = ({ clawName }) => (
    <>
        <div className='mb-8 flex h-28 w-28 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-500/30 to-emerald-500/5 shadow-2xl shadow-emerald-500/20'>
            <div className='flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600'>
                <CheckCircleIcon
                    className='h-12 w-12 text-white'
                    weight='fill'
                />
            </div>
        </div>
        <h1 className='text-3xl font-semibold tracking-tight md:text-5xl'>
            Your AI OS is ready
        </h1>
        <p className='text-muted-foreground mt-3 max-w-md text-base'>
            {clawName ? (
                <>
                    <span className='text-foreground font-medium'>
                        {clawName}
                    </span>{' '}
                    is online. Opening it now…
                </>
            ) : (
                'Your AI OS is online. Opening it now…'
            )}
        </p>
    </>
)

const FailedStage: FC<{ onBack: () => void; onRetry: () => void }> = ({
    onBack,
    onRetry
}) => (
    <>
        <div className='from-destructive/30 to-destructive/5 mb-8 flex h-28 w-28 items-center justify-center rounded-3xl bg-gradient-to-br shadow-2xl shadow-destructive/20'>
            <div className='from-destructive to-destructive/80 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br'>
                <WarningCircleIcon
                    className='h-12 w-12 text-white'
                    weight='fill'
                />
            </div>
        </div>
        <h1 className='text-3xl font-semibold tracking-tight md:text-5xl'>
            Setup hit a snag
        </h1>
        <p className='text-muted-foreground mt-3 max-w-md text-base'>
            Something went wrong while bringing up your AI OS. Your
            activation code wasn't consumed — you can retry from your
            dashboard.
        </p>
        <div className='mt-8 flex items-center gap-3'>
            <Button variant='outline' onClick={onBack}>
                Back to AI OS
            </Button>
            <Button onClick={onRetry}>Refresh status</Button>
        </div>
    </>
)

const PhaseDot: FC<{ state: 'done' | 'active' | 'pending' | 'failed' }> = ({
    state
}) => {
    if (state === 'done') {
        return (
            <CheckCircleIcon
                className='h-5 w-5 shrink-0 text-emerald-500'
                weight='fill'
            />
        )
    }
    if (state === 'active') {
        return (
            <CircleNotchIcon
                className='text-primary h-5 w-5 shrink-0 animate-spin'
                weight='bold'
            />
        )
    }
    if (state === 'failed') {
        return (
            <WarningCircleIcon
                className='text-destructive h-5 w-5 shrink-0'
                weight='fill'
            />
        )
    }
    return (
        <CircleIcon className='text-muted-foreground/40 h-5 w-5 shrink-0' />
    )
}

export default Progress