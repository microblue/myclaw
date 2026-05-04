import type { FC } from 'react'

import { useNavigate, useSearchParams } from 'react-router-dom'
import { ROUTES } from '@/lib'
import { Button } from '@/components/ui'
import { useProviders } from '@/hooks'
import { writeState } from '@/pages/MintCodes/state'

const ORDER: Record<string, number> = {
    lightsail: 0,
    hetzner: 1,
    digitalocean: 2
}

const COPY: Record<string, { badge?: string; tagline: string }> = {
    lightsail: {
        badge: 'Recommended',
        tagline: 'Predictable monthly pricing, global AWS regions, easy to scale.'
    },
    hetzner: {
        tagline: 'Excellent price-performance, EU + US + Singapore datacenters.'
    },
    digitalocean: {
        tagline: 'Developer-friendly droplets, CPU/Memory-optimised tiers.'
    }
}

const StepProvider: FC = () => {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const selected = searchParams.get('provider') || ''
    const { providers, isLoading, error } = useProviders()

    const sorted = [...providers].sort(
        (a, b) => (ORDER[a.id] ?? 99) - (ORDER[b.id] ?? 99)
    )

    const select = (id: string) => {
        // Switching provider invalidates plan + region; clear them so we
        // don't carry a stale planId into the next step.
        const next = writeState(searchParams, {
            provider: id,
            planId: '',
            region: ''
        })
        navigate(`${ROUTES.MINT_CODES_PLAN}?${next.toString()}`)
    }

    return (
        <div className='space-y-6'>
            <div>
                <h2 className='text-2xl font-semibold'>
                    Pick a cloud provider
                </h2>
                <p className='text-muted-foreground mt-1 text-sm'>
                    Every code in this batch will deploy on the provider you
                    pick. You can mint a separate batch for each provider.
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

            <div className='grid gap-4 md:grid-cols-3'>
                {sorted.map((p) => {
                    const copy = COPY[p.id] ?? { tagline: p.description }
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
                <Button
                    variant='outline'
                    onClick={() =>
                        navigate(`${ROUTES.ADMIN}?tab=codes`)
                    }
                >
                    Cancel
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