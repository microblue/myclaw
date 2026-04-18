import type { FC } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ROUTES } from '@/lib'
import { Button } from '@/components/ui'
import useProviders from '@/hooks/useProviders/useProviders'

// Preferred display order: Lightsail first per PRD (AWS priority),
// then Hetzner, then DigitalOcean. Unknown providers render last.
const ORDER: Record<string, number> = {
    lightsail: 0,
    hetzner: 1,
    digitalocean: 2
}

const PROVIDER_COPY: Record<string, { badge?: string; tagline: string }> = {
    lightsail: {
        badge: 'Recommended',
        tagline: 'Predictable monthly pricing, global AWS regions, easy to scale.'
    },
    hetzner: {
        tagline: 'Excellent price-performance, EU + US datacenters, ARM options.'
    },
    digitalocean: {
        tagline: 'Developer-friendly droplets, CPU/Memory-optimised tiers.'
    }
}

const StepProvider: FC = () => {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const selected = searchParams.get('provider')
    const { providers, isLoading, error } = useProviders()

    const sorted = [...providers].sort(
        (a, b) => (ORDER[a.id] ?? 99) - (ORDER[b.id] ?? 99)
    )

    const select = (id: string) => {
        const next = new URLSearchParams(searchParams)
        next.set('provider', id)
        next.delete('planId')
        next.delete('location')
        navigate(`${ROUTES.NEW_CLAW_PLAN}?${next.toString()}`)
    }

    const goBack = () =>
        navigate(`${ROUTES.NEW_CLAW}?${searchParams.toString()}`)

    return (
        <div className='space-y-6'>
            <div>
                <h2 className='text-2xl font-semibold'>Pick a cloud provider</h2>
                <p className='text-muted-foreground mt-1 text-sm'>
                    Your instance runs on the provider you pick. You can change this the next time you deploy.
                </p>
            </div>

            {isLoading && (
                <div className='text-muted-foreground py-10 text-center text-sm'>
                    Loading providers…
                </div>
            )}

            {error && (
                <div className='text-destructive py-10 text-center text-sm'>
                    Failed to load providers. Try reloading the page.
                </div>
            )}

            {!isLoading && !error && sorted.length === 0 && (
                <div className='rounded-lg border border-dashed p-10 text-center text-sm'>
                    No providers are configured on this deployment. Contact the administrator.
                </div>
            )}

            <div className='grid gap-4 md:grid-cols-3'>
                {sorted.map((p) => {
                    const copy = PROVIDER_COPY[p.id] ?? { tagline: p.description }
                    const isSelected = p.id === selected
                    return (
                        <button
                            key={p.id}
                            type='button'
                            onClick={() => select(p.id)}
                            className={`relative rounded-lg border p-5 text-left transition-all ${
                                isSelected
                                    ? 'border-primary ring-primary/40 ring-2'
                                    : 'hover:border-primary/60'
                            }`}
                        >
                            {copy.badge && (
                                <span className='bg-primary text-primary-foreground absolute -top-2 right-4 rounded-full px-2 py-0.5 text-xs'>
                                    {copy.badge}
                                </span>
                            )}
                            <h3 className='font-semibold'>{p.name}</h3>
                            <p className='text-muted-foreground mt-2 text-sm'>
                                {copy.tagline}
                            </p>
                        </button>
                    )
                })}
            </div>

            <div className='flex justify-between'>
                <Button variant='outline' onClick={goBack}>
                    Back
                </Button>
                <Button
                    onClick={() => selected && select(selected)}
                    disabled={!selected}
                >
                    Continue
                </Button>
            </div>
        </div>
    )
}

export default StepProvider