import type { FC } from 'react'

import { useEffect, useMemo, useState } from 'react'
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
    useProviderLocations,
    useProviderPlans,
    useProviderAvailability
} from '@/hooks'

interface Props {
    open: boolean
    onClose: () => void
    onSuccess: () => void
}

const formatPlanLabel = (p: {
    id: string
    name: string
    cpu: number
    memory: number
    disk: number
    priceMonthly: number
}): string => {
    const price = `$${p.priceMonthly.toFixed(2)}/mo`
    return `${p.id} — ${p.cpu} vCPU · ${p.memory} GB RAM · ${p.disk} GB · ${price}`
}

const deriveTierLabel = (p: {
    cpu: number
    memory: number
}): string => `${p.cpu} vCPU · ${p.memory} GB`

const AdminMintCodesModal: FC<Props> = ({ open, onClose, onSuccess }) => {
    const [provider, setProvider] = useState('hetzner')
    const [planId, setPlanId] = useState('')
    const [region, setRegion] = useState('')
    const [tierLabel, setTierLabel] = useState('')
    const [tierLabelEdited, setTierLabelEdited] = useState(false)
    const [partnerName, setPartnerName] = useState('')
    const [count, setCount] = useState(10)
    const [validityMonths, setValidityMonths] = useState<string>('12')
    const [expiresAt, setExpiresAt] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const toast = useToast()

    const { plans, isLoading: loadingPlans } = useProviderPlans(
        provider || null
    )
    const { locations, isLoading: loadingLocations } = useProviderLocations(
        provider || null
    )
    const { availability: planAvailability } = useProviderAvailability(
        provider || null
    )

    const selectedPlan = useMemo(
        () => plans.find((p) => p.id === planId) || null,
        [plans, planId]
    )

    // Region availability for the selected plan. The plan-availability map
    // is `{ [planId]: locationId[] }` — empty array or missing means "all".
    const eligibleLocations = useMemo(() => {
        const enabled = locations.filter((l) => !l.disabled)
        if (!planId) return enabled
        const allowed = planAvailability[planId]
        if (!allowed || allowed.length === 0) return enabled
        return enabled.filter((l) => allowed.includes(l.id))
    }, [locations, planAvailability, planId])

    // Reset plan + region whenever the provider changes; the IDs aren't
    // shared across providers and a stale planId would silently fail
    // server-side validation.
    useEffect(() => {
        setPlanId('')
        setRegion('')
        if (!tierLabelEdited) setTierLabel('')
    }, [provider, tierLabelEdited])

    // Drop region the moment it stops being valid for the chosen plan, so
    // the dropdown never shows a value the user can't actually mint.
    useEffect(() => {
        if (region && !eligibleLocations.find((l) => l.id === region))
            setRegion('')
    }, [region, eligibleLocations])

    // Auto-fill tier label from the picked plan unless the admin has typed
    // their own. Resetting `tierLabelEdited` is not needed — once they edit
    // it once, we stop auto-filling for the lifetime of the modal.
    useEffect(() => {
        if (tierLabelEdited) return
        if (selectedPlan) setTierLabel(deriveTierLabel(selectedPlan))
        else setTierLabel('')
    }, [selectedPlan, tierLabelEdited])

    const handleSubmit = async () => {
        if (!planId || !region || count < 1) return
        setSubmitting(true)
        try {
            const months = validityMonths === '' ? null : Number(validityMonths)
            const result = await api.createActivationCodeBatch({
                provider,
                planId,
                region,
                tierLabel: tierLabel.trim() || null,
                partnerName: partnerName.trim() || null,
                validityMonths: months,
                expiresAt: expiresAt
                    ? new Date(expiresAt).toISOString()
                    : null,
                count
            })
            // Auto-download CSV so the admin can hand it to the partner.
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
            <DialogContent className='max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto'>
                <DialogHeader>
                    <DialogTitle>Mint activation codes</DialogTitle>
                </DialogHeader>
                <div className='space-y-4 py-4'>
                    <div className='space-y-1.5'>
                        <Label htmlFor='mint-provider'>Provider</Label>
                        <select
                            id='mint-provider'
                            value={provider}
                            onChange={(e) => setProvider(e.target.value)}
                            className='border-input bg-background w-full rounded-md border px-3 py-2 text-sm'
                        >
                            <option value='hetzner'>hetzner</option>
                            <option value='lightsail'>lightsail</option>
                            <option value='digitalocean'>digitalocean</option>
                        </select>
                    </div>

                    <div className='space-y-1.5'>
                        <Label htmlFor='mint-plan'>Plan</Label>
                        <select
                            id='mint-plan'
                            value={planId}
                            onChange={(e) => setPlanId(e.target.value)}
                            disabled={loadingPlans}
                            className='border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-50'
                        >
                            <option value=''>
                                {loadingPlans ? 'Loading plans…' : 'Select a plan'}
                            </option>
                            {plans
                                .filter((p) => !p.disabled)
                                .map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {formatPlanLabel(p)}
                                    </option>
                                ))}
                        </select>
                    </div>

                    <div className='space-y-1.5'>
                        <Label htmlFor='mint-region'>Region</Label>
                        <select
                            id='mint-region'
                            value={region}
                            onChange={(e) => setRegion(e.target.value)}
                            disabled={loadingLocations || !planId}
                            className='border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-50'
                        >
                            <option value=''>
                                {!planId
                                    ? 'Pick a plan first'
                                    : loadingLocations
                                      ? 'Loading regions…'
                                      : eligibleLocations.length === 0
                                        ? 'No regions for this plan'
                                        : 'Select a region'}
                            </option>
                            {eligibleLocations.map((l) => (
                                <option key={l.id} value={l.id}>
                                    {l.id} — {l.name} ({l.country})
                                </option>
                            ))}
                        </select>
                        <p className='text-muted-foreground text-xs'>
                            Locked at mint time — every code in this batch
                            deploys here. For users in China, Hetzner{' '}
                            <code>sin</code> (Singapore) is the closest
                            region.
                        </p>
                    </div>

                    <div className='space-y-1.5'>
                        <Label htmlFor='mint-tier'>
                            Tier label{' '}
                            <span className='text-muted-foreground text-xs font-normal'>
                                (auto-filled from plan)
                            </span>
                        </Label>
                        <Input
                            id='mint-tier'
                            placeholder='Pro · 4 GB'
                            value={tierLabel}
                            onChange={(e) => {
                                setTierLabel(e.target.value)
                                setTierLabelEdited(true)
                            }}
                        />
                    </div>

                    <div className='space-y-1.5'>
                        <Label htmlFor='mint-partner'>Partner name</Label>
                        <Input
                            id='mint-partner'
                            placeholder='GreatLove'
                            value={partnerName}
                            onChange={(e) => setPartnerName(e.target.value)}
                        />
                    </div>

                    <div className='grid grid-cols-2 gap-3'>
                        <div className='space-y-1.5'>
                            <Label htmlFor='mint-count'>Count</Label>
                            <Input
                                id='mint-count'
                                type='number'
                                min={1}
                                max={1000}
                                value={count}
                                onChange={(e) =>
                                    setCount(Number(e.target.value || 0))
                                }
                            />
                        </div>
                        <div className='space-y-1.5'>
                            <Label htmlFor='mint-validity'>
                                Validity (months)
                            </Label>
                            <Input
                                id='mint-validity'
                                type='number'
                                min={1}
                                placeholder='Empty = perpetual'
                                value={validityMonths}
                                onChange={(e) =>
                                    setValidityMonths(e.target.value)
                                }
                            />
                        </div>
                    </div>

                    <div className='space-y-1.5'>
                        <Label htmlFor='mint-expires'>
                            Code expires (optional)
                        </Label>
                        <Input
                            id='mint-expires'
                            type='date'
                            value={expiresAt}
                            onChange={(e) => setExpiresAt(e.target.value)}
                        />
                        <p className='text-muted-foreground text-xs'>
                            After this date, the code can no longer be redeemed.
                            Different from the claw lifetime above.
                        </p>
                    </div>
                </div>
                <div className='flex justify-end gap-2 pt-2'>
                    <Button variant='outline' onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={
                            !planId || !region || count < 1 || submitting
                        }
                    >
                        {submitting ? 'Minting…' : `Mint ${count} codes`}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export default AdminMintCodesModal