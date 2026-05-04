import type { FC } from 'react'
import type { ActivationCodePreview } from '@/ts/Interfaces'

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ROUTES, api } from '@/lib'
import { Button, Input, Label } from '@/components/ui'
import { usePurchaseClaw, useToast } from '@/hooks'

interface Props {
    code: string
    preview: ActivationCodePreview
    onBack: () => void
}

const validityLabel = (months?: number | null) => {
    if (months == null) return 'Perpetual'
    if (months === 12) return '1 year'
    if (months % 12 === 0) return `${months / 12} years`
    return `${months} month${months === 1 ? '' : 's'}`
}

const StepConfirm: FC<Props> = ({ code, preview, onBack }) => {
    const navigate = useNavigate()
    const purchase = usePurchaseClaw()
    const toast = useToast()

    const suggestNameQuery = useQuery({
        queryKey: ['suggestClawName'],
        queryFn: () => api.suggestClawName(),
        staleTime: Infinity
    })

    const [name, setName] = useState('')
    useEffect(() => {
        if (!name && suggestNameQuery.data?.name) {
            setName(suggestNameQuery.data.name)
        }
    }, [name, suggestNameQuery.data?.name])

    const locations = preview.locations || []
    const [location, setLocation] = useState(locations[0]?.id || '')

    const handleDeploy = async () => {
        if (!name || !location) return
        try {
            const result = await purchase.mutateAsync({
                activationCode: code,
                name,
                location
            })
            toast.success(`Deploying ${name}…`)
            const clawId = result.pendingClawId
            navigate(
                clawId
                    ? `${ROUTES.CLAWS}?provisioning=${clawId}`
                    : ROUTES.CLAWS
            )
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Deploy failed'
            toast.error(message)
        }
    }

    const ready = Boolean(name && location)

    return (
        <div className='space-y-6'>
            <div>
                <h2 className='text-2xl font-semibold'>Confirm and deploy</h2>
                <p className='text-muted-foreground mt-1 text-sm'>
                    Your Claw configuration is locked by the activation code.
                    Pick a name and region, then deploy.
                </p>
            </div>

            <dl className='divide-y rounded-lg border'>
                <SummaryRow
                    label='Tier'
                    value={preview.tierLabel || preview.planId || '—'}
                />
                <SummaryRow
                    label='Provider'
                    value={preview.provider || '—'}
                />
                <SummaryRow
                    label='Validity'
                    value={validityLabel(preview.validityMonths)}
                />
            </dl>

            <div className='space-y-2'>
                <Label htmlFor='claw-name'>Instance name</Label>
                <Input
                    id='claw-name'
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={suggestNameQuery.data?.name || 'my-claw'}
                />
            </div>

            <div className='space-y-2'>
                <Label htmlFor='claw-region'>Region</Label>
                <select
                    id='claw-region'
                    className='border-input bg-background w-full rounded-md border px-3 py-2 text-sm'
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                >
                    {locations.length === 0 && (
                        <option value=''>No regions available</option>
                    )}
                    {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                            {l.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className='flex justify-between'>
                <Button variant='outline' onClick={onBack}>
                    Back
                </Button>
                <Button
                    onClick={handleDeploy}
                    disabled={!ready || purchase.isPending}
                >
                    {purchase.isPending ? 'Deploying…' : 'Deploy'}
                </Button>
            </div>
        </div>
    )
}

const SummaryRow: FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className='flex justify-between px-4 py-3 text-sm'>
        <dt className='text-muted-foreground'>{label}</dt>
        <dd className='text-foreground text-right'>{value}</dd>
    </div>
)

export default StepConfirm