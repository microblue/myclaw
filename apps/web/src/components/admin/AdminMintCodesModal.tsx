import type { FC } from 'react'

import { useEffect, useState } from 'react'
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
import { useToast, useProviderLocations } from '@/hooks'

interface Props {
    open: boolean
    onClose: () => void
    onSuccess: () => void
}

const AdminMintCodesModal: FC<Props> = ({ open, onClose, onSuccess }) => {
    const [provider, setProvider] = useState('hetzner')
    const [planId, setPlanId] = useState('')
    const [region, setRegion] = useState('')
    const [tierLabel, setTierLabel] = useState('')
    const [partnerName, setPartnerName] = useState('')
    const [count, setCount] = useState(10)
    const [validityMonths, setValidityMonths] = useState<string>('12')
    const [expiresAt, setExpiresAt] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const toast = useToast()

    const { locations, isLoading: loadingLocations } = useProviderLocations(
        provider || null
    )

    // Reset region when the provider changes (a region from one provider
    // generally won't exist on another).
    useEffect(() => {
        setRegion('')
    }, [provider])

    const handleSubmit = async () => {
        if (!planId.trim() || !region || count < 1) return
        setSubmitting(true)
        try {
            const months = validityMonths === '' ? null : Number(validityMonths)
            const result = await api.createActivationCodeBatch({
                provider,
                planId: planId.trim(),
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
                    <div className='grid grid-cols-2 gap-3'>
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
                            <Label htmlFor='mint-plan'>Plan ID</Label>
                            <Input
                                id='mint-plan'
                                placeholder='cpx21'
                                value={planId}
                                onChange={(e) => setPlanId(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className='space-y-1.5'>
                        <Label htmlFor='mint-region'>Region</Label>
                        <select
                            id='mint-region'
                            value={region}
                            onChange={(e) => setRegion(e.target.value)}
                            disabled={loadingLocations}
                            className='border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-50'
                        >
                            <option value=''>
                                {loadingLocations
                                    ? 'Loading regions…'
                                    : 'Select a region'}
                            </option>
                            {locations
                                .filter((l) => !l.disabled)
                                .map((l) => (
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
                            Tier label (optional)
                        </Label>
                        <Input
                            id='mint-tier'
                            placeholder='Pro · 4 GB'
                            value={tierLabel}
                            onChange={(e) => setTierLabel(e.target.value)}
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
                            !planId.trim() ||
                            !region ||
                            count < 1 ||
                            submitting
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