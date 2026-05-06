import type { FC } from 'react'

import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ROUTES, api } from '@/lib'
import { Button, Input, Label } from '@/components/ui'
import { writeState, readState } from '@/pages/MintCodes/state'
import Calendar from '@/pages/MintCodes/Calendar'

const COUNT_PRESETS = [1, 5, 10, 25, 50, 100]
// Per the white-paper appendix A code spec (xxxxxxxxx-ddd-uuu) these
// match the four standard subscription windows. Free tier is 7 days.
const VALIDITY_PRESETS: { label: string; value: number }[] = [
    { label: '7 days (trial)', value: 7 },
    { label: '90 days', value: 90 },
    { label: '180 days', value: 180 },
    { label: '365 days', value: 365 }
]
const SEATS_PRESETS: { label: string; value: number }[] = [
    { label: '1 device', value: 1 },
    { label: '5 devices', value: 5 },
    { label: '25 devices', value: 25 },
    { label: '50 devices', value: 50 }
]

const StepDetails: FC = () => {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const s = readState(searchParams)

    useEffect(() => {
        if (!s.provider) navigate(ROUTES.MINT_CODES, { replace: true })
        else if (!s.planId || !s.region)
            navigate(
                `${ROUTES.MINT_CODES_PLAN}?${searchParams.toString()}`,
                { replace: true }
            )
    }, [s.provider, s.planId, s.region, navigate, searchParams])

    // Auto-fill the display label with "$cpu vCPU · $ram GB" the first
    // time we land here (admin can still edit). We piggyback on the
    // curatedPlans query so we don't pay for a separate request.
    const plansQuery = useQuery({
        queryKey: ['curatedPlans', s.provider, 'openclaw'],
        queryFn: () => api.getProviderCuratedPlans(s.provider, 'openclaw'),
        enabled: Boolean(s.provider),
        staleTime: 5 * 60 * 1000
    })
    const plan = plansQuery.data?.find((p) => p.id === s.planId)

    useEffect(() => {
        if (!plan || s.tierLabel) return
        const label = `${plan.cpu} vCPU · ${plan.memory} GB`
        const next = writeState(searchParams, { tierLabel: label })
        navigate(`${ROUTES.MINT_CODES_DETAILS}?${next.toString()}`, {
            replace: true
        })
    }, [plan, s.tierLabel, navigate, searchParams])

    const update = (patch: Parameters<typeof writeState>[1]) => {
        const next = writeState(searchParams, patch)
        navigate(`${ROUTES.MINT_CODES_DETAILS}?${next.toString()}`, {
            replace: true
        })
    }

    const goBack = () =>
        navigate(`${ROUTES.MINT_CODES_PLAN}?${searchParams.toString()}`)
    const goNext = () =>
        navigate(`${ROUTES.MINT_CODES_REVIEW}?${searchParams.toString()}`)

    const canContinue = s.count >= 1 && s.count <= 1000

    return (
        <div className='space-y-8'>
            <div>
                <h2 className='text-2xl font-semibold'>Batch details</h2>
                <p className='text-muted-foreground mt-1 text-sm'>
                    How many codes, who they're for, and how long they're
                    good for.
                </p>
            </div>

            <Section
                title='How many codes'
                description='Each code is single-use and tied to one claw deploy.'
            >
                <TileRow
                    options={COUNT_PRESETS.map((n) => ({
                        label: String(n),
                        active: s.count === n,
                        onClick: () => update({ count: n })
                    }))}
                />
                <div className='mt-3 max-w-[180px]'>
                    <Label htmlFor='custom-count'>
                        <span className='text-muted-foreground text-xs'>
                            Custom (1–1000)
                        </span>
                    </Label>
                    <Input
                        id='custom-count'
                        type='number'
                        min={1}
                        max={1000}
                        value={s.count}
                        onChange={(e) =>
                            update({
                                count: Math.max(
                                    1,
                                    Math.min(
                                        1000,
                                        Number(e.target.value || 0)
                                    )
                                )
                            })
                        }
                    />
                </div>
            </Section>

            <Section
                title='Subscription window'
                description="How many days the redeemed claw stays alive before auto-cleanup. Each seat's window starts on its own first activation."
            >
                <TileRow
                    options={VALIDITY_PRESETS.map((opt) => ({
                        label: opt.label,
                        active: s.validityDays === opt.value,
                        onClick: () => update({ validityDays: opt.value })
                    }))}
                />
            </Section>

            <Section
                title='Seats per code'
                description='How many separate redemptions each minted code can carry — 5 / 25 / 50 unlock the channel batch packs.'
            >
                <TileRow
                    options={SEATS_PRESETS.map((opt) => ({
                        label: opt.label,
                        active: s.seats === opt.value,
                        onClick: () => update({ seats: opt.value })
                    }))}
                />
            </Section>

            <Section
                title='Code expiry'
                description='Optional — the date the unredeemed code itself stops working. Leave blank for no expiry.'
            >
                <div className='max-w-sm'>
                    <Calendar
                        value={s.expiresAt}
                        onChange={(value) => update({ expiresAt: value })}
                    />
                </div>
            </Section>

            <Section
                title='Partner & display label'
                description='These are visible to the user (label) or just to you (partner name).'
            >
                <div className='grid gap-3 md:grid-cols-2'>
                    <div className='space-y-1.5'>
                        <Label htmlFor='partner'>Partner name</Label>
                        <Input
                            id='partner'
                            placeholder='GreatLove'
                            value={s.partnerName}
                            onChange={(e) =>
                                update({ partnerName: e.target.value })
                            }
                        />
                        <p className='text-muted-foreground text-xs'>
                            Internal label to find this batch later.
                        </p>
                    </div>
                    <div className='space-y-1.5'>
                        <Label htmlFor='tierlabel'>Display label</Label>
                        <Input
                            id='tierlabel'
                            placeholder='4 vCPU · 8 GB'
                            value={s.tierLabel}
                            onChange={(e) =>
                                update({ tierLabel: e.target.value })
                            }
                        />
                        <p className='text-muted-foreground text-xs'>
                            Shown to the user on the redeem page.
                        </p>
                    </div>
                </div>
            </Section>

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

const Section: FC<{
    title: string
    description: string
    children: React.ReactNode
}> = ({ title, description, children }) => (
    <div className='space-y-3'>
        <div>
            <h3 className='text-sm font-semibold'>{title}</h3>
            <p className='text-muted-foreground mt-0.5 text-xs'>
                {description}
            </p>
        </div>
        {children}
    </div>
)

const TileRow: FC<{
    options: { label: string; active: boolean; onClick: () => void }[]
}> = ({ options }) => (
    <div className='flex flex-wrap gap-2'>
        {options.map((opt) => (
            <button
                key={opt.label}
                type='button'
                onClick={opt.onClick}
                className={`rounded-md border px-4 py-2 text-sm transition-all ${
                    opt.active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'hover:border-primary/60'
                }`}
            >
                {opt.label}
            </button>
        ))}
    </div>
)

export default StepDetails