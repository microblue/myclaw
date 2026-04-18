import type { FC } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ROUTES } from '@/lib'
import { CLAW_TYPES } from '@/lib/clawTypes'
import { Button } from '@/components/ui'

const StepType: FC = () => {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const selected = searchParams.get('type') || 'openclaw'

    const handleSelect = (id: string) => {
        const entry = CLAW_TYPES.find((c) => c.id === id)
        if (!entry || entry.comingSoon) return
        const next = new URLSearchParams(searchParams)
        next.set('type', id)
        navigate(`${ROUTES.NEW_CLAW_PROVIDER}?${next.toString()}`)
    }

    return (
        <div className='space-y-6'>
            <div>
                <h2 className='text-2xl font-semibold'>Which Claw do you want?</h2>
                <p className='text-muted-foreground mt-1 text-sm'>
                    Pick the Claw runtime to deploy. OpenClaw is available today; the rest are on the roadmap.
                </p>
            </div>
            <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
                {CLAW_TYPES.map((t) => {
                    const isSelected = t.id === selected
                    const disabled = t.comingSoon
                    return (
                        <button
                            key={t.id}
                            type='button'
                            onClick={() => handleSelect(t.id)}
                            disabled={disabled}
                            className={`rounded-lg border p-5 text-left transition-all ${
                                disabled
                                    ? 'opacity-60 cursor-not-allowed'
                                    : isSelected
                                      ? 'border-primary ring-primary/40 ring-2'
                                      : 'hover:border-primary/60'
                            }`}
                        >
                            <div className='flex items-start justify-between'>
                                <h3 className='font-semibold'>{t.name}</h3>
                                {t.comingSoon && (
                                    <span className='bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs'>
                                        Coming soon
                                    </span>
                                )}
                            </div>
                            <p className='text-muted-foreground mt-1 text-sm'>
                                {t.tagline}
                            </p>
                            <p className='mt-3 text-sm'>{t.description}</p>
                        </button>
                    )
                })}
            </div>
            <div className='flex justify-end'>
                <Button
                    onClick={() => handleSelect(selected)}
                    disabled={!CLAW_TYPES.find((c) => c.id === selected && !c.comingSoon)}
                >
                    Continue
                </Button>
            </div>
        </div>
    )
}

export default StepType