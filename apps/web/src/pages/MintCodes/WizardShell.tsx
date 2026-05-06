import type { FC } from 'react'

import {
    Outlet,
    useLocation,
    useNavigate,
    useSearchParams
} from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ROUTES, api } from '@/lib'
import AppShell from '@/components/layout/AppShell'
import { Button } from '@/components/ui'
import { CheckIcon } from '@phosphor-icons/react'
import { readState } from '@/pages/MintCodes/state'

const STEPS: { path: string; label: string }[] = [
    { path: ROUTES.MINT_CODES, label: 'Provider' },
    { path: ROUTES.MINT_CODES_PLAN, label: 'Configuration' },
    { path: ROUTES.MINT_CODES_DETAILS, label: 'Batch' },
    { path: ROUTES.MINT_CODES_REVIEW, label: 'Review' }
]

const WizardShell: FC = () => {
    const location = useLocation()
    const navigate = useNavigate()

    const currentIndex = Math.max(
        0,
        STEPS.findIndex((s) => s.path === location.pathname)
    )

    const backAction = (
        <Button
            variant='ghost'
            size='sm'
            onClick={() => navigate(`${ROUTES.ADMIN}?tab=codes`)}
        >
            Cancel
        </Button>
    )

    return (
        <AppShell pageActions={backAction}>
            <div className='mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8'>
                <div className='mb-8'>
                    <h1 className='text-xl font-semibold md:text-2xl'>
                        Mint activation codes
                    </h1>
                    <p className='text-muted-foreground mt-1 text-sm'>
                        Generate a batch of one-shot codes for a channel
                        partner. Region, plan, and lifetime are baked in at
                        mint time.
                    </p>
                    <StepDots currentIndex={currentIndex} />
                </div>

                <div className='grid gap-8 lg:grid-cols-[1fr_280px]'>
                    <div>
                        <Outlet />
                    </div>
                    <aside className='hidden lg:block'>
                        <SummaryPanel />
                    </aside>
                </div>
            </div>
        </AppShell>
    )
}

const StepDots: FC<{ currentIndex: number }> = ({ currentIndex }) => (
    <ol className='mt-6 flex items-center gap-2 overflow-x-auto'>
        {STEPS.map((step, i) => {
            const isDone = i < currentIndex
            const isCurrent = i === currentIndex
            return (
                <li
                    key={step.path}
                    className='flex items-center gap-2 whitespace-nowrap'
                >
                    <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                            isDone
                                ? 'bg-primary text-primary-foreground'
                                : isCurrent
                                  ? 'bg-primary/15 text-primary border-primary border'
                                  : 'bg-muted text-muted-foreground'
                        }`}
                    >
                        {isDone ? (
                            <CheckIcon
                                className='h-3.5 w-3.5'
                                weight='bold'
                            />
                        ) : (
                            i + 1
                        )}
                    </span>
                    <span
                        className={`text-sm ${
                            isCurrent
                                ? 'text-foreground font-medium'
                                : isDone
                                  ? 'text-foreground'
                                  : 'text-muted-foreground'
                        }`}
                    >
                        {step.label}
                    </span>
                    {i < STEPS.length - 1 && (
                        <span
                            className={`mx-1 h-px w-6 ${
                                isDone ? 'bg-primary' : 'bg-muted'
                            }`}
                            aria-hidden
                        />
                    )}
                </li>
            )
        })}
    </ol>
)

const SummaryPanel: FC = () => {
    const [searchParams] = useSearchParams()
    const s = readState(searchParams)

    const plansQuery = useQuery({
        queryKey: ['curatedPlans', s.provider, 'openclaw'],
        queryFn: () => api.getProviderCuratedPlans(s.provider, 'openclaw'),
        enabled: Boolean(s.provider),
        staleTime: 5 * 60 * 1000
    })
    const plan = plansQuery.data?.find((p) => p.id === s.planId)

    const validity = `${s.validityDays} day${s.validityDays === 1 ? '' : 's'}`

    return (
        <div className='bg-card sticky top-20 rounded-lg border p-5'>
            <h3 className='text-muted-foreground text-xs font-medium uppercase tracking-wide'>
                Batch summary
            </h3>
            <dl className='mt-4 space-y-3 text-sm'>
                <Row
                    label='Provider'
                    value={s.provider ? capitalize(s.provider) : '—'}
                />
                <Row
                    label='Plan'
                    value={plan ? plan.name.toUpperCase() : '—'}
                />
                <Row label='Region' value={s.region || '—'} />
                {plan && (
                    <>
                        <div className='border-border my-2 border-t' />
                        <Row label='CPU' value={`${plan.cpu} vCPU`} />
                        <Row label='RAM' value={`${plan.memory} GB`} />
                        <Row label='Disk' value={`${plan.disk} GB`} />
                    </>
                )}
                <div className='border-border my-2 border-t' />
                <Row label='Codes' value={String(s.count)} />
                <Row label='Lifetime' value={validity} />
                <Row label='Partner' value={s.partnerName || '—'} />
                <Row label='Code expiry' value={s.expiresAt || 'No expiry'} />
            </dl>
        </div>
    )
}

const Row: FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className='flex justify-between'>
        <dt className='text-muted-foreground text-xs'>{label}</dt>
        <dd className='text-foreground text-right text-xs'>{value}</dd>
    </div>
)

const capitalize = (s: string): string =>
    s.charAt(0).toUpperCase() + s.slice(1)

export default WizardShell