import type { FC } from 'react'
import type { ProviderPlan } from '@/ts/Interfaces'

import { useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ROUTES, api } from '@/lib'
import { Button } from '@/components/ui'
import { useProviderLocations, useProviderAvailability } from '@/hooks'
import { writeState, readState } from '@/pages/MintCodes/state'

const StepPlan: FC = () => {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const s = readState(searchParams)

    // Bounce back to step 1 if someone deep-links here without a provider.
    useEffect(() => {
        if (!s.provider) navigate(ROUTES.MINT_CODES, { replace: true })
    }, [s.provider, navigate])

    const plansQuery = useQuery({
        queryKey: ['curatedPlans', s.provider, 'openclaw'],
        queryFn: () => api.getProviderCuratedPlans(s.provider, 'openclaw'),
        enabled: Boolean(s.provider),
        staleTime: 5 * 60 * 1000
    })
    const plans = plansQuery.data || []

    const { locations, isLoading: loadingLocations } = useProviderLocations(
        s.provider || null
    )
    const { availability } = useProviderAvailability(s.provider || null)

    const eligibleLocations = useMemo(() => {
        const enabled = locations.filter((l) => !l.disabled)
        if (!s.planId) return enabled
        const allowed = availability[s.planId]
        if (!allowed || allowed.length === 0) return enabled
        return enabled.filter((l) => allowed.includes(l.id))
    }, [locations, availability, s.planId])

    // Drop the region the moment it stops being valid for the selected
    // plan — server would reject the mint, and silently clearing it is
    // less confusing than letting the user submit and fail.
    useEffect(() => {
        if (s.region && !eligibleLocations.find((l) => l.id === s.region)) {
            const next = writeState(searchParams, { region: '' })
            navigate(`${ROUTES.MINT_CODES_PLAN}?${next.toString()}`, {
                replace: true
            })
        }
    }, [s.region, eligibleLocations, navigate, searchParams])

    const setPlan = (planId: string) => {
        const next = writeState(searchParams, { planId })
        navigate(`${ROUTES.MINT_CODES_PLAN}?${next.toString()}`, {
            replace: true
        })
    }
    const setRegion = (region: string) => {
        const next = writeState(searchParams, { region })
        navigate(`${ROUTES.MINT_CODES_PLAN}?${next.toString()}`, {
            replace: true
        })
    }

    const goBack = () =>
        navigate(`${ROUTES.MINT_CODES}?${searchParams.toString()}`)
    const goNext = () =>
        navigate(`${ROUTES.MINT_CODES_DETAILS}?${searchParams.toString()}`)

    const canContinue = Boolean(s.planId && s.region)

    return (
        <div className='space-y-6'>
            <div>
                <h2 className='text-2xl font-semibold'>
                    Pick a configuration
                </h2>
                <p className='text-muted-foreground mt-1 text-sm'>
                    Four sizes, scaling from 4 GB up. CPU and memory are
                    what OpenClaw cares about — disk is sized to match.
                </p>
            </div>

            <PlanGrid
                plans={plans}
                selected={s.planId}
                loading={plansQuery.isLoading}
                error={plansQuery.error}
                onSelect={setPlan}
            />

            <div className='space-y-2'>
                <label className='text-muted-foreground text-xs uppercase tracking-wide'>
                    Region
                </label>
                {!s.planId ? (
                    <p className='text-muted-foreground text-xs'>
                        Pick a configuration first to see the regions where
                        it's available.
                    </p>
                ) : loadingLocations ? (
                    <div className='text-muted-foreground py-2 text-sm'>
                        Loading regions…
                    </div>
                ) : eligibleLocations.length === 0 ? (
                    <p className='text-destructive text-xs'>
                        This configuration isn't available in any region.
                    </p>
                ) : (
                    <>
                        <div className='flex flex-wrap gap-2'>
                            {eligibleLocations.map((l) => {
                                const isSelected = l.id === s.region
                                return (
                                    <button
                                        key={l.id}
                                        type='button'
                                        onClick={() => setRegion(l.id)}
                                        className={`rounded-full border px-3 py-1 text-sm transition-all ${
                                            isSelected
                                                ? 'border-primary bg-primary text-primary-foreground'
                                                : 'hover:border-primary/60'
                                        }`}
                                    >
                                        {l.city || l.name} · {l.country}
                                    </button>
                                )
                            })}
                        </div>
                        <p className='text-muted-foreground text-xs'>
                            For users in China, Hetzner Singapore (sin) is
                            the closest region.
                        </p>
                    </>
                )}
            </div>

            <div className='flex justify-between'>
                <Button variant='outline' onClick={goBack}>
                    Back
                </Button>
                <Button onClick={goNext} disabled={!canContinue}>
                    Continue
                </Button>
            </div>
        </div>
    )
}

const PlanGrid: FC<{
    plans: ProviderPlan[]
    selected: string
    loading: boolean
    error: unknown
    onSelect: (planId: string) => void
}> = ({ plans, selected, loading, error, onSelect }) => {
    if (loading) {
        return (
            <div className='text-muted-foreground py-10 text-center text-sm'>
                Loading plans…
            </div>
        )
    }
    if (error) {
        return (
            <div className='text-destructive py-10 text-center text-sm'>
                Failed to load plans for this provider.
            </div>
        )
    }
    if (plans.length === 0) {
        return (
            <div className='text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm'>
                No plans curated for this provider yet.
            </div>
        )
    }
    return (
        <div className='grid gap-3 md:grid-cols-2 lg:grid-cols-4'>
            {plans.map((p) => {
                const isSelected = p.id === selected
                return (
                    <button
                        key={p.id}
                        type='button'
                        onClick={() => onSelect(p.id)}
                        disabled={p.disabled}
                        className={`rounded-lg border p-4 text-left transition-all ${
                            p.disabled
                                ? 'cursor-not-allowed opacity-60'
                                : isSelected
                                  ? 'border-primary ring-primary/40 ring-2'
                                  : 'hover:border-primary/60'
                        }`}
                    >
                        <div className='flex items-baseline justify-between'>
                            <span className='font-semibold uppercase tracking-wide'>
                                {p.name}
                            </span>
                            <span className='text-muted-foreground text-xs'>
                                {p.architecture}
                            </span>
                        </div>
                        <div className='mt-2'>
                            <div className='text-primary text-2xl font-semibold'>
                                ${p.priceMonthly.toFixed(2)}
                                <span className='text-muted-foreground ml-1 text-xs font-normal'>
                                    /mo
                                </span>
                            </div>
                        </div>
                        <dl className='text-muted-foreground mt-3 space-y-1 text-xs'>
                            <Row
                                label='CPU'
                                value={`${p.cpu} vCPU`}
                            />
                            <Row
                                label='RAM'
                                value={`${p.memory} GB`}
                            />
                            <Row
                                label='Disk'
                                value={`${p.disk} GB ${p.diskType.toUpperCase()}`}
                            />
                        </dl>
                    </button>
                )
            })}
        </div>
    )
}

const Row: FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className='flex justify-between'>
        <dt>{label}</dt>
        <dd className='text-foreground'>{value}</dd>
    </div>
)

export default StepPlan