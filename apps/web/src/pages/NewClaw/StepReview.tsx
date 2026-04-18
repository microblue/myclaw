import type { FC } from 'react'
import type { PurchaseClawData } from '@/ts/Interfaces'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ROUTES, api } from '@/lib'
import { Button, Input, Label } from '@/components/ui'
import { getClawType } from '@/lib/clawTypes'
import { useToast } from '@/hooks'
import usePurchaseClaw from '@/hooks/useClaws/usePurchaseClaw'

const StepReview: FC = () => {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()

    const clawTypeId = searchParams.get('type') || 'openclaw'
    const providerId = searchParams.get('provider') || ''
    const planId = searchParams.get('planId') || ''
    const location = searchParams.get('location') || ''

    const clawType = getClawType(clawTypeId)

    const suggestNameQuery = useQuery({
        queryKey: ['suggestClawName'],
        queryFn: () => api.suggestClawName(),
        staleTime: Infinity
    })

    const plansQuery = useQuery({
        queryKey: ['curatedPlans', providerId],
        queryFn: () => api.getProviderCuratedPlans(providerId),
        enabled: Boolean(providerId)
    })
    const locationsQuery = useQuery({
        queryKey: ['providerLocations', providerId],
        queryFn: () => api.getProviderLocations(providerId),
        enabled: Boolean(providerId)
    })

    const plan = plansQuery.data?.find((p) => p.id === planId)
    const region = locationsQuery.data?.find((l) => l.id === location)

    const [name, setName] = useState('')
    useEffect(() => {
        if (!name && suggestNameQuery.data?.name) {
            setName(suggestNameQuery.data.name)
        }
    }, [name, suggestNameQuery.data?.name])

    const purchase = usePurchaseClaw()
    const toast = useToast()

    const goBack = () =>
        navigate(`${ROUTES.NEW_CLAW_PLAN}?${searchParams.toString()}`)

    const handleDeploy = async () => {
        if (!plan || !providerId || !location || !name) return
        const data: PurchaseClawData = {
            name,
            clawType: clawTypeId,
            planId: plan.id,
            location,
            priceMonthly: plan.priceMonthly,
            provider: providerId,
            billingInterval: 'month'
        }
        try {
            const result = await purchase.mutateAsync(data)
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

    const ready = Boolean(plan && region && name && providerId)

    return (
        <div className='space-y-6'>
            <div>
                <h2 className='text-2xl font-semibold'>Review and deploy</h2>
                <p className='text-muted-foreground mt-1 text-sm'>
                    One more look before we spin up your Claw.
                </p>
            </div>

            <div className='space-y-2'>
                <Label htmlFor='claw-name'>Instance name</Label>
                <Input
                    id='claw-name'
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={suggestNameQuery.data?.name || 'my-claw'}
                />
                <p className='text-muted-foreground text-xs'>
                    You can rename it later in the dashboard.
                </p>
            </div>

            <dl className='divide-y rounded-lg border'>
                <SummaryRow
                    label='Claw type'
                    value={clawType?.name || clawTypeId}
                />
                <SummaryRow label='Provider' value={providerId || '—'} />
                <SummaryRow
                    label='Configuration'
                    value={
                        plan
                            ? `${plan.name.toUpperCase()} · ${plan.cpu} vCPU · ${plan.memory} GB RAM · ${plan.disk} GB disk`
                            : '—'
                    }
                />
                <SummaryRow
                    label='Region'
                    value={
                        region
                            ? `${region.city || region.name}, ${region.country}`
                            : '—'
                    }
                />
                <SummaryRow
                    label='Price'
                    value={plan ? `$${plan.priceMonthly.toFixed(2)}/mo` : '—'}
                />
            </dl>

            <div className='bg-muted text-muted-foreground rounded-md p-3 text-xs'>
                Payment is skipped during the current test phase — your instance
                will be provisioned directly after clicking Deploy.
            </div>

            <div className='flex justify-between'>
                <Button variant='outline' onClick={goBack}>
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

export default StepReview