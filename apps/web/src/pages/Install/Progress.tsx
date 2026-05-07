import type { FC } from 'react'

import { useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import { PageTitle } from '@/components'
import { Button } from '@/components/ui'
import { ROUTES } from '@/lib'
import useClaw from '@/hooks/useClaws/useClaw'
import useInstallPhaseSubscription from '@/hooks/useInstallPhaseSubscription'

// The phases the installer reports, in display order. The labels are
// what the user sees; the keys must match the enum in
// apps/api/src/controllers/install/postInstallPhase.ts.
const PHASE_STEPS: { key: string; label: string }[] = [
    { key: 'renting_compute', label: 'Renting compute' },
    { key: 'mounting_storage', label: 'Mounting storage' },
    { key: 'installing_kernel', label: 'Installing AI-OS kernel' },
    { key: 'pulling_image', label: 'Pulling container image' },
    { key: 'wiring_network', label: 'Wiring network' },
    { key: 'issuing_certificate', label: 'Issuing TLS certificate' },
    { key: 'loading_skills', label: 'Loading skills' },
    { key: 'calibrating_agents', label: 'Calibrating agents' },
    { key: 'ready', label: 'Ready' }
]

const PHASE_INDEX = new Map(
    PHASE_STEPS.map((step, idx) => [step.key, idx])
)

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

    // Once the installer reports `ready`, hand off to the AI-OS home.
    // The redirect is only triggered on the transition (effect dep),
    // not on every render — otherwise a user navigating back here
    // post-install would be punted away immediately.
    useEffect(() => {
        if (latestPhase === 'ready') {
            const timer = setTimeout(() => {
                navigate(`${ROUTES.CLAWS}/${clawId}`, { replace: true })
            }, 1500)
            return () => clearTimeout(timer)
        }
        return undefined
    }, [latestPhase, clawId, navigate])

    const failed = latestPhase === 'failed'

    const currentIdx = useMemo(() => {
        if (!latestPhase || latestPhase === 'failed') return -1
        return PHASE_INDEX.get(latestPhase) ?? -1
    }, [latestPhase])

    const logTail = useMemo(() => {
        // Concatenate log_chunk fields, newest last. Cap to last
        // ~400 lines so the DOM doesn't bloat on a long install.
        const joined = rows
            .map((r) => r.logChunk)
            .filter(Boolean)
            .join('\n')
        const lines = joined.split('\n')
        return lines.slice(-400).join('\n')
    }, [rows])

    if (!clawId) {
        return (
            <AppShell>
                <PageTitle title='Installing AI-OS' noIndex />
                <main className='mx-auto w-full max-w-3xl px-4 py-12 md:px-6'>
                    <p className='text-destructive'>Missing claw id.</p>
                </main>
            </AppShell>
        )
    }

    return (
        <AppShell>
            <PageTitle title='Installing AI-OS' noIndex />
            <main className='mx-auto w-full max-w-3xl px-4 py-8 md:px-6'>
                <header className='mb-8'>
                    <h1 className='text-2xl font-semibold'>
                        {failed
                            ? 'Install failed'
                            : latestPhase === 'ready'
                              ? 'Your AI-OS is ready'
                              : 'Installing your AI-OS'}
                    </h1>
                    <p className='text-muted-foreground mt-1 text-sm'>
                        {claw?.name
                            ? `Claw "${claw.name}"`
                            : 'Provisioning compute and bringing up services.'}
                        {!connected && installRunId && !failed && (
                            <span className='ml-2 text-xs italic'>
                                · reconnecting…
                            </span>
                        )}
                    </p>
                </header>

                {error && (
                    <div className='mb-6 rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive'>
                        Live updates unavailable: {error.message}. The install
                        is still running — refresh in a moment to catch up.
                    </div>
                )}

                <ol className='space-y-3'>
                    {PHASE_STEPS.map((step, idx) => {
                        const state = failed
                            ? 'pending'
                            : idx < currentIdx
                              ? 'done'
                              : idx === currentIdx
                                ? 'active'
                                : 'pending'
                        return (
                            <li
                                key={step.key}
                                className='flex items-center gap-3'
                            >
                                <PhaseDot state={state} />
                                <span
                                    className={
                                        state === 'pending'
                                            ? 'text-muted-foreground text-sm'
                                            : state === 'active'
                                              ? 'text-sm font-medium'
                                              : 'text-sm'
                                    }
                                >
                                    {step.label}
                                </span>
                            </li>
                        )
                    })}
                </ol>

                {logTail && (
                    <section className='mt-10'>
                        <h2 className='mb-2 text-sm font-medium'>
                            Install log
                        </h2>
                        <pre className='bg-muted text-muted-foreground max-h-80 overflow-auto rounded-lg p-4 text-xs leading-relaxed'>
                            {logTail}
                        </pre>
                    </section>
                )}

                {failed && (
                    <div className='mt-8 flex items-center gap-3'>
                        <Button
                            variant='outline'
                            onClick={() => navigate(ROUTES.CLAWS)}
                        >
                            Back to dashboard
                        </Button>
                        <Button
                            onClick={() => clawQuery.refetch()}
                        >
                            Retry status check
                        </Button>
                    </div>
                )}
            </main>
        </AppShell>
    )
}

const PhaseDot: FC<{ state: 'done' | 'active' | 'pending' }> = ({
    state
}) => {
    if (state === 'done') {
        return (
            <span
                aria-hidden
                className='flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white'
            >
                ✓
            </span>
        )
    }
    if (state === 'active') {
        return (
            <span
                aria-hidden
                className='h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70'
            />
        )
    }
    return (
        <span
            aria-hidden
            className='border-muted-foreground/40 h-5 w-5 rounded-full border-2'
        />
    )
}

export default Progress