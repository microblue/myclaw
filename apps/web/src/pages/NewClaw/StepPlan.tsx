import type { FC } from 'react'
import type { ProviderPlan } from '@/ts/Interfaces'
import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ROUTES, api } from '@/lib'
import { Button } from '@/components/ui'

const StepPlan: FC = () => {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const providerId = searchParams.get('provider') || ''
    const selectedPlanId = searchParams.get('planId')
    const selectedLocation = searchParams.get('location')

    const plansQuery = useQuery({
        queryKey: ['curatedPlans', providerId],
        queryFn: () => api.getProviderCuratedPlans(providerId),
        enabled: Boolean(providerId),
        staleTime: 5 * 60 * 1000
    })
    const locationsQuery = useQuery({
        queryKey: ['providerLocations', providerId],
        queryFn: () => api.getProviderLocations(providerId),
        enabled: Boolean(providerId),
        staleTime: 5 * 60 * 1000
    })

    const plans = plansQuery.data || []
    const locations = locationsQuery.data || []

    const defaultLocation = useMemo(
        () => locations.find((l) => !l.disabled)?.id,
        [locations]
    )
    const currentLocation = selectedLocation || defaultLocation || ''

    const goBack = () =>
        navigate(`${ROUTES.NEW_CLAW_PROVIDER}?${searchParams.toString()}`)

    const handleSelectPlan = (planId: string) => {
        const next = new URLSearchParams(searchParams)
        next.set('planId', planId)
        if (!selectedLocation && currentLocation) {
            next.set('location', currentLocation)
        }
        navigate(`${ROUTES.NEW_CLAW_PLAN}?${next.toString()}`, {
            replace: true
        })
    }

    const handleSelectLocation = (locationId: string) => {
        const next = new URLSearchParams(searchParams)
        next.set('location', locationId)
        navigate(`${ROUTES.NEW_CLAW_PLAN}?${next.toString()}`, {
            replace: true
        })
    }

    const handleContinue = () => {
        const next = new URLSearchParams(searchParams)
        if (!next.get('location') && currentLocation) {
            next.set('location', currentLocation)
        }
        navigate(`${ROUTES.NEW_CLAW_REVIEW}?${next.toString()}`)
    }

    const canContinue = Boolean(selectedPlanId && currentLocation)

    return (
        <div className='space-y-6'>
            <div>
                <h2 className='text-2xl font-semibold'>Pick a configuration</h2>
                <p className='text-muted-foreground mt-1 text-sm'>
                    Twelve most-common sizes for this provider. You can pick the region below.
                </p>
            </div>

            <LocationPicker
                locations={locations}
                selected={currentLocation}
                onSelect={handleSelectLocation}
                loading={locationsQuery.isLoading}
            />

            <PlanGrid
                plans={plans}
                selected={selectedPlanId}
                onSelect={handleSelectPlan}
                loading={plansQuery.isLoading}
                error={plansQuery.error}
            />

            <div className='flex justify-between'>
                <Button variant='outline' onClick={goBack}>
                    Back
                </Button>
                <Button onClick={handleContinue} disabled={!canContinue}>
                    Continue
                </Button>
            </div>
        </div>
    )
}

const LocationPicker: FC<{
    locations: { id: string; name: string; city?: string; country: string; disabled: boolean }[]
    selected: string
    onSelect: (id: string) => void
    loading: boolean
}> = ({ locations, selected, onSelect, loading }) => {
    if (loading) {
        return (
            <div className='text-muted-foreground py-6 text-sm'>
                Loading regions…
            </div>
        )
    }
    return (
        <div className='space-y-2'>
            <label className='text-muted-foreground text-xs uppercase tracking-wide'>
                Region
            </label>
            <div className='flex flex-wrap gap-2'>
                {locations
                    .filter((l) => !l.disabled)
                    .map((l) => (
                        <button
                            key={l.id}
                            type='button'
                            onClick={() => onSelect(l.id)}
                            className={`rounded-full border px-3 py-1 text-sm transition-all ${
                                l.id === selected
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'hover:border-primary/60'
                            }`}
                        >
                            {l.city ? `${l.city}` : l.name} · {l.country}
                        </button>
                    ))}
            </div>
        </div>
    )
}

const PlanGrid: FC<{
    plans: ProviderPlan[]
    selected: string | null
    onSelect: (planId: string) => void
    loading: boolean
    error: unknown
}> = ({ plans, selected, onSelect, loading, error }) => {
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
            <div className='rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground'>
                No plans curated for this provider yet.
            </div>
        )
    }
    return (
        <div className='grid gap-3 md:grid-cols-2 lg:grid-cols-3'>
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
                                ? 'opacity-60 cursor-not-allowed'
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
                        <div className='text-primary mt-2 text-2xl font-semibold'>
                            ${p.priceMonthly.toFixed(2)}
                            <span className='text-muted-foreground ml-1 text-xs font-normal'>
                                /mo
                            </span>
                        </div>
                        <dl className='text-muted-foreground mt-3 space-y-1 text-xs'>
                            <div className='flex justify-between'>
                                <dt>CPU</dt>
                                <dd className='text-foreground'>{p.cpu} vCPU</dd>
                            </div>
                            <div className='flex justify-between'>
                                <dt>RAM</dt>
                                <dd className='text-foreground'>
                                    {p.memory} GB
                                </dd>
                            </div>
                            <div className='flex justify-between'>
                                <dt>Disk</dt>
                                <dd className='text-foreground'>
                                    {p.disk} GB {p.diskType.toUpperCase()}
                                </dd>
                            </div>
                        </dl>
                    </button>
                )
            })}
        </div>
    )
}

export default StepPlan