import type { FC } from 'react'
import type { ProviderPlan } from '@/ts/Interfaces'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import {
    Button,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    Input,
    Label
} from '@/components/ui'
import {
    useToast,
    useProviders,
    useProviderLocations,
    useProviderAvailability
} from '@/hooks'

interface Props {
    open: boolean
    onClose: () => void
    onSuccess: () => void
}

type Step = 1 | 2 | 3 | 4

const PROVIDER_COPY: Record<string, { badge?: string; tagline: string }> = {
    lightsail: {
        badge: 'Recommended',
        tagline: 'Predictable monthly pricing, global AWS regions, easy to scale.'
    },
    hetzner: {
        tagline: 'Excellent price-performance, EU + US + Singapore datacenters, ARM options.'
    },
    digitalocean: {
        tagline: 'Developer-friendly droplets, CPU/Memory-optimised tiers.'
    }
}

const ORDER: Record<string, number> = {
    lightsail: 0,
    hetzner: 1,
    digitalocean: 2
}

const deriveTierLabel = (p: { cpu: number; memory: number }): string =>
    `${p.cpu} vCPU · ${p.memory} GB`

const initialState = () => ({
    step: 1 as Step,
    providerId: '',
    planId: '',
    region: '',
    tierLabel: '',
    tierLabelEdited: false,
    partnerName: '',
    count: 10,
    validityMonths: '12',
    expiresAt: ''
})

const AdminMintCodesModal: FC<Props> = ({ open, onClose, onSuccess }) => {
    const [s, setS] = useState(initialState)
    const [submitting, setSubmitting] = useState(false)
    const toast = useToast()

    // Reset whenever the dialog re-opens, so a previous half-finished
    // batch doesn't leak into the next mint.
    useEffect(() => {
        if (open) setS(initialState())
    }, [open])

    const { providers, isLoading: loadingProviders } = useProviders()
    const sortedProviders = useMemo(
        () =>
            [...providers].sort(
                (a, b) => (ORDER[a.id] ?? 99) - (ORDER[b.id] ?? 99)
            ),
        [providers]
    )

    const plansQuery = useQuery({
        queryKey: ['curatedPlans', s.providerId, 'openclaw'],
        queryFn: () => api.getProviderCuratedPlans(s.providerId, 'openclaw'),
        enabled: Boolean(s.providerId),
        staleTime: 5 * 60 * 1000
    })
    const plans = plansQuery.data || []
    const selectedPlan = useMemo(
        () => plans.find((p) => p.id === s.planId) || null,
        [plans, s.planId]
    )

    const { locations, isLoading: loadingLocations } = useProviderLocations(
        s.providerId || null
    )
    const { availability } = useProviderAvailability(s.providerId || null)

    const eligibleLocations = useMemo(() => {
        const enabled = locations.filter((l) => !l.disabled)
        if (!s.planId) return enabled
        const allowed = availability[s.planId]
        if (!allowed || allowed.length === 0) return enabled
        return enabled.filter((l) => allowed.includes(l.id))
    }, [locations, availability, s.planId])

    // Drop region the moment it stops being valid for the chosen plan.
    useEffect(() => {
        if (s.region && !eligibleLocations.find((l) => l.id === s.region))
            setS((prev) => ({ ...prev, region: '' }))
    }, [s.region, eligibleLocations])

    // Auto-fill tier label from the picked plan unless the admin has
    // typed their own.
    useEffect(() => {
        setS((prev) => {
            if (prev.tierLabelEdited) return prev
            return {
                ...prev,
                tierLabel: selectedPlan ? deriveTierLabel(selectedPlan) : ''
            }
        })
    }, [selectedPlan])

    const setProvider = (id: string) =>
        setS((prev) => ({
            ...prev,
            providerId: id,
            planId: '',
            region: '',
            tierLabel: prev.tierLabelEdited ? prev.tierLabel : '',
            step: 2
        }))
    const setPlanAndRegion = (planId: string, region: string) =>
        setS((prev) => ({ ...prev, planId, region }))
    const goTo = (step: Step) => setS((prev) => ({ ...prev, step }))
    const update = <K extends keyof ReturnType<typeof initialState>>(
        key: K,
        value: ReturnType<typeof initialState>[K]
    ) => setS((prev) => ({ ...prev, [key]: value }))

    const handleMint = async () => {
        if (!s.planId || !s.region || s.count < 1) return
        setSubmitting(true)
        try {
            const months =
                s.validityMonths === '' ? null : Number(s.validityMonths)
            const result = await api.createActivationCodeBatch({
                provider: s.providerId,
                planId: s.planId,
                region: s.region,
                tierLabel: s.tierLabel.trim() || null,
                partnerName: s.partnerName.trim() || null,
                validityMonths: months,
                expiresAt: s.expiresAt
                    ? new Date(s.expiresAt).toISOString()
                    : null,
                count: s.count
            })
            const exportUrl = `/admin/activation-codes/batches/${result.batchId}/export`
            const a = document.createElement('a')
            a.href = exportUrl
            a.click()
            toast.success(`Minted ${result.count} codes.`)
            onSuccess()
            onClose()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Mint failed')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className='max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto'>
                <DialogHeader>
                    <DialogTitle>Mint activation codes</DialogTitle>
                </DialogHeader>

                <Stepper step={s.step} />

                <div className='py-4'>
                    {s.step === 1 && (
                        <StepProvider
                            providers={sortedProviders}
                            selected={s.providerId}
                            loading={loadingProviders}
                            onSelect={setProvider}
                        />
                    )}
                    {s.step === 2 && (
                        <StepPlanAndRegion
                            plans={plans}
                            plansLoading={plansQuery.isLoading}
                            plansError={plansQuery.error}
                            locations={eligibleLocations}
                            allLocationsCount={locations.length}
                            locationsLoading={loadingLocations}
                            selectedPlanId={s.planId}
                            selectedRegion={s.region}
                            onSelectPlan={(id) =>
                                setPlanAndRegion(id, s.region)
                            }
                            onSelectRegion={(id) =>
                                setPlanAndRegion(s.planId, id)
                            }
                        />
                    )}
                    {s.step === 3 && (
                        <StepBatchDetails
                            partnerName={s.partnerName}
                            count={s.count}
                            validityMonths={s.validityMonths}
                            expiresAt={s.expiresAt}
                            tierLabel={s.tierLabel}
                            onPartnerName={(v) => update('partnerName', v)}
                            onCount={(v) => update('count', v)}
                            onValidity={(v) => update('validityMonths', v)}
                            onExpires={(v) => update('expiresAt', v)}
                            onTierLabel={(v) =>
                                setS((prev) => ({
                                    ...prev,
                                    tierLabel: v,
                                    tierLabelEdited: true
                                }))
                            }
                        />
                    )}
                    {s.step === 4 && (
                        <StepReview
                            providerName={
                                providers.find((p) => p.id === s.providerId)
                                    ?.name || s.providerId
                            }
                            plan={selectedPlan}
                            regionLabel={
                                locations.find((l) => l.id === s.region)
                                    ?.name || s.region
                            }
                            regionId={s.region}
                            tierLabel={s.tierLabel}
                            partnerName={s.partnerName}
                            count={s.count}
                            validityMonths={s.validityMonths}
                            expiresAt={s.expiresAt}
                        />
                    )}
                </div>

                <Footer
                    step={s.step}
                    canContinue={canContinueFor(s)}
                    submitting={submitting}
                    count={s.count}
                    onBack={() => {
                        if (s.step === 1) onClose()
                        else goTo((s.step - 1) as Step)
                    }}
                    onContinue={() => {
                        if (s.step < 4) goTo((s.step + 1) as Step)
                        else handleMint()
                    }}
                />
            </DialogContent>
        </Dialog>
    )
}

const canContinueFor = (s: ReturnType<typeof initialState>): boolean => {
    if (s.step === 1) return Boolean(s.providerId)
    if (s.step === 2) return Boolean(s.planId && s.region)
    if (s.step === 3) return s.count >= 1 && s.count <= 1000
    return true
}

const Stepper: FC<{ step: Step }> = ({ step }) => {
    const labels = ['Provider', 'Configuration', 'Batch', 'Review']
    return (
        <ol className='mt-2 flex items-center gap-2 text-xs'>
            {labels.map((label, i) => {
                const n = (i + 1) as Step
                const active = n === step
                const done = n < step
                return (
                    <li key={label} className='flex flex-1 items-center gap-2'>
                        <div
                            className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs ${
                                active
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : done
                                      ? 'border-primary text-primary'
                                      : 'border-muted-foreground/40 text-muted-foreground'
                            }`}
                        >
                            {n}
                        </div>
                        <span
                            className={
                                active
                                    ? 'font-medium'
                                    : 'text-muted-foreground'
                            }
                        >
                            {label}
                        </span>
                        {n < 4 && (
                            <div className='bg-muted-foreground/20 h-px flex-1' />
                        )}
                    </li>
                )
            })}
        </ol>
    )
}

const StepProvider: FC<{
    providers: { id: string; name: string; description: string }[]
    selected: string
    loading: boolean
    onSelect: (id: string) => void
}> = ({ providers, selected, loading, onSelect }) => {
    if (loading) {
        return (
            <div className='text-muted-foreground py-10 text-center text-sm'>
                Loading providers…
            </div>
        )
    }
    return (
        <div className='space-y-4'>
            <div>
                <h3 className='text-lg font-semibold'>Pick a cloud provider</h3>
                <p className='text-muted-foreground mt-1 text-sm'>
                    Every code in this batch will deploy on the provider you
                    pick.
                </p>
            </div>
            <div className='grid gap-3 md:grid-cols-3'>
                {providers.map((p) => {
                    const copy = PROVIDER_COPY[p.id] ?? {
                        tagline: p.description
                    }
                    const isSelected = p.id === selected
                    return (
                        <button
                            key={p.id}
                            type='button'
                            onClick={() => onSelect(p.id)}
                            className={`relative rounded-lg border p-4 text-left transition-all ${
                                isSelected
                                    ? 'border-primary ring-primary/40 ring-2'
                                    : 'hover:border-primary/60'
                            }`}
                        >
                            {copy.badge && (
                                <span className='bg-primary text-primary-foreground absolute -top-2 right-3 rounded-full px-2 py-0.5 text-xs'>
                                    {copy.badge}
                                </span>
                            )}
                            <h4 className='font-semibold'>{p.name}</h4>
                            <p className='text-muted-foreground mt-2 text-xs'>
                                {copy.tagline}
                            </p>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

const StepPlanAndRegion: FC<{
    plans: ProviderPlan[]
    plansLoading: boolean
    plansError: unknown
    locations: {
        id: string
        name: string
        city?: string
        country: string
        disabled: boolean
    }[]
    allLocationsCount: number
    locationsLoading: boolean
    selectedPlanId: string
    selectedRegion: string
    onSelectPlan: (id: string) => void
    onSelectRegion: (id: string) => void
}> = ({
    plans,
    plansLoading,
    plansError,
    locations,
    allLocationsCount,
    locationsLoading,
    selectedPlanId,
    selectedRegion,
    onSelectPlan,
    onSelectRegion
}) => (
    <div className='space-y-5'>
        <div>
            <h3 className='text-lg font-semibold'>Pick a configuration</h3>
            <p className='text-muted-foreground mt-1 text-sm'>
                These are the most-common server sizes for the provider you
                picked. Pick the size, then the region you want to lock in.
            </p>
        </div>

        {plansLoading ? (
            <div className='text-muted-foreground py-10 text-center text-sm'>
                Loading plans…
            </div>
        ) : plansError ? (
            <div className='text-destructive py-10 text-center text-sm'>
                Failed to load plans for this provider.
            </div>
        ) : plans.length === 0 ? (
            <div className='text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm'>
                No plans curated for this provider yet.
            </div>
        ) : (
            <div className='grid gap-3 md:grid-cols-2 lg:grid-cols-3'>
                {plans.map((p) => {
                    const isSelected = p.id === selectedPlanId
                    return (
                        <button
                            key={p.id}
                            type='button'
                            onClick={() => onSelectPlan(p.id)}
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
        )}

        <div className='space-y-2'>
            <label className='text-muted-foreground text-xs uppercase tracking-wide'>
                Region
            </label>
            {locationsLoading ? (
                <div className='text-muted-foreground py-2 text-sm'>
                    Loading regions…
                </div>
            ) : !selectedPlanId ? (
                <p className='text-muted-foreground text-xs'>
                    Pick a configuration first to see available regions.
                </p>
            ) : locations.length === 0 ? (
                <p className='text-destructive text-xs'>
                    {allLocationsCount === 0
                        ? 'No regions available for this provider.'
                        : 'This configuration is not available in any region.'}
                </p>
            ) : (
                <>
                    <div className='flex flex-wrap gap-2'>
                        {locations.map((l) => {
                            const isSelected = l.id === selectedRegion
                            return (
                                <button
                                    key={l.id}
                                    type='button'
                                    onClick={() => onSelectRegion(l.id)}
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
                        For users in China, Hetzner Singapore (sin) is the
                        closest region.
                    </p>
                </>
            )}
        </div>
    </div>
)

const Row: FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className='flex justify-between'>
        <dt>{label}</dt>
        <dd className='text-foreground'>{value}</dd>
    </div>
)

const StepBatchDetails: FC<{
    partnerName: string
    count: number
    validityMonths: string
    expiresAt: string
    tierLabel: string
    onPartnerName: (v: string) => void
    onCount: (v: number) => void
    onValidity: (v: string) => void
    onExpires: (v: string) => void
    onTierLabel: (v: string) => void
}> = ({
    partnerName,
    count,
    validityMonths,
    expiresAt,
    tierLabel,
    onPartnerName,
    onCount,
    onValidity,
    onExpires,
    onTierLabel
}) => (
    <div className='space-y-4'>
        <div>
            <h3 className='text-lg font-semibold'>Batch details</h3>
            <p className='text-muted-foreground mt-1 text-sm'>
                How many codes, who they're for, and how long they're good
                for.
            </p>
        </div>

        <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1.5'>
                <Label htmlFor='mint-count'>How many codes</Label>
                <Input
                    id='mint-count'
                    type='number'
                    min={1}
                    max={1000}
                    value={count}
                    onChange={(e) => onCount(Number(e.target.value || 0))}
                />
            </div>
            <div className='space-y-1.5'>
                <Label htmlFor='mint-validity'>Claw lifetime</Label>
                <Input
                    id='mint-validity'
                    type='number'
                    min={1}
                    placeholder='Months — empty = perpetual'
                    value={validityMonths}
                    onChange={(e) => onValidity(e.target.value)}
                />
                <p className='text-muted-foreground text-xs'>
                    How many months the deployed claw lives before
                    auto-cleanup. Empty = perpetual.
                </p>
            </div>
        </div>

        <div className='space-y-1.5'>
            <Label htmlFor='mint-partner'>Partner name (optional)</Label>
            <Input
                id='mint-partner'
                placeholder='GreatLove'
                value={partnerName}
                onChange={(e) => onPartnerName(e.target.value)}
            />
            <p className='text-muted-foreground text-xs'>
                Just a label to find this batch later in the codes table.
            </p>
        </div>

        <div className='space-y-1.5'>
            <Label htmlFor='mint-tier'>
                Display label{' '}
                <span className='text-muted-foreground text-xs font-normal'>
                    (auto-filled, editable)
                </span>
            </Label>
            <Input
                id='mint-tier'
                placeholder='Pro · 4 GB'
                value={tierLabel}
                onChange={(e) => onTierLabel(e.target.value)}
            />
            <p className='text-muted-foreground text-xs'>
                Shown to the user on the redeem page above the deploy
                button.
            </p>
        </div>

        <div className='space-y-1.5'>
            <Label htmlFor='mint-expires'>
                Code expiry (optional)
            </Label>
            <Input
                id='mint-expires'
                type='date'
                value={expiresAt}
                onChange={(e) => onExpires(e.target.value)}
            />
            <p className='text-muted-foreground text-xs'>
                After this date the code itself can no longer be redeemed.
                Different from the claw lifetime above.
            </p>
        </div>
    </div>
)

const StepReview: FC<{
    providerName: string
    plan: ProviderPlan | null
    regionLabel: string
    regionId: string
    tierLabel: string
    partnerName: string
    count: number
    validityMonths: string
    expiresAt: string
}> = ({
    providerName,
    plan,
    regionLabel,
    regionId,
    tierLabel,
    partnerName,
    count,
    validityMonths,
    expiresAt
}) => {
    const validity =
        validityMonths === ''
            ? 'Perpetual'
            : `${validityMonths} month${validityMonths === '1' ? '' : 's'}`
    return (
        <div className='space-y-4'>
            <div>
                <h3 className='text-lg font-semibold'>Review and mint</h3>
                <p className='text-muted-foreground mt-1 text-sm'>
                    A CSV with all {count} codes will download as soon as
                    you confirm.
                </p>
            </div>

            <dl className='divide-y rounded-lg border'>
                <ReviewRow label='Provider' value={providerName} />
                <ReviewRow
                    label='Configuration'
                    value={
                        plan
                            ? `${plan.cpu} vCPU · ${plan.memory} GB · ${plan.disk} GB · $${plan.priceMonthly.toFixed(2)}/mo (${plan.id})`
                            : '—'
                    }
                />
                <ReviewRow
                    label='Region'
                    value={`${regionLabel}${regionId && regionId !== regionLabel ? ` (${regionId})` : ''}`}
                />
                <ReviewRow
                    label='Display label'
                    value={tierLabel || '—'}
                />
                <ReviewRow
                    label='Partner'
                    value={partnerName || '—'}
                />
                <ReviewRow label='Codes in batch' value={String(count)} />
                <ReviewRow label='Claw lifetime' value={validity} />
                <ReviewRow
                    label='Code expiry'
                    value={expiresAt || 'No expiry'}
                />
            </dl>
        </div>
    )
}

const ReviewRow: FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className='flex justify-between gap-4 px-4 py-3 text-sm'>
        <dt className='text-muted-foreground'>{label}</dt>
        <dd className='text-foreground text-right'>{value}</dd>
    </div>
)

const Footer: FC<{
    step: Step
    canContinue: boolean
    submitting: boolean
    count: number
    onBack: () => void
    onContinue: () => void
}> = ({ step, canContinue, submitting, count, onBack, onContinue }) => (
    <div className='flex justify-between gap-2 pt-2'>
        <Button variant='outline' onClick={onBack} disabled={submitting}>
            {step === 1 ? 'Cancel' : 'Back'}
        </Button>
        <Button
            onClick={onContinue}
            disabled={!canContinue || submitting}
        >
            {step < 4
                ? 'Continue'
                : submitting
                  ? 'Minting…'
                  : `Mint ${count} codes`}
        </Button>
    </div>
)

export default AdminMintCodesModal