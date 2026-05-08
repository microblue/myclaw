import type { FC } from 'react'

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ROUTES, api } from '@/lib'
import { Button } from '@/components/ui'
import { useToast, useProviderLocations } from '@/hooks'
import { readState } from '@/pages/MintCodes/state'

const StepReview: FC = () => {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const toast = useToast()
    const s = readState(searchParams)
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        if (!s.provider) navigate(ROUTES.MINT_CODES, { replace: true })
        else if (!s.planId || !s.region)
            navigate(
                `${ROUTES.MINT_CODES_PLAN}?${searchParams.toString()}`,
                { replace: true }
            )
    }, [s.provider, s.planId, s.region, navigate, searchParams])

    const plansQuery = useQuery({
        queryKey: ['curatedPlans', s.provider, 'openclaw'],
        queryFn: () => api.getProviderCuratedPlans(s.provider, 'openclaw'),
        enabled: Boolean(s.provider),
        staleTime: 5 * 60 * 1000
    })
    const plan = plansQuery.data?.find((p) => p.id === s.planId)
    const { locations } = useProviderLocations(s.provider || null)
    const regionLabel =
        locations.find((l) => l.id === s.region)?.name || s.region

    const goBack = () =>
        navigate(`${ROUTES.MINT_CODES_DETAILS}?${searchParams.toString()}`)

    const handleMint = async () => {
        setSubmitting(true)
        try {
            const result = await api.createActivationCodeBatch({
                skuKind: s.skuKind,
                provider: s.skuKind === 'new' ? s.provider : null,
                planId: s.skuKind === 'new' ? s.planId : null,
                region: s.skuKind === 'new' ? s.region : null,
                tierLabel: s.tierLabel.trim() || null,
                partnerName: s.partnerName.trim() || null,
                validityDays: s.validityDays,
                seats: s.seats,
                expiresAt: s.expiresAt
                    ? new Date(s.expiresAt).toISOString()
                    : null,
                count: s.count
            })
            await api.downloadActivationCodeBatchCsv(result.batchId)
            toast.success(`Minted ${result.count} codes.`)
            navigate(`${ROUTES.ADMIN}?tab=codes`)
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Mint failed')
        } finally {
            setSubmitting(false)
        }
    }

    const validity = `${s.validityDays} day${s.validityDays === 1 ? '' : 's'}`
    const seatsLabel = `${s.seats} ${s.seats === 1 ? 'seat' : 'seats'}`
    const skuLabel = s.skuKind === 'renewal' ? 'Renewal' : 'New claw'

    return (
        <div className='space-y-6'>
            <div>
                <h2 className='text-2xl font-semibold'>Review and mint</h2>
                <p className='text-muted-foreground mt-1 text-sm'>
                    A CSV with all {s.count} codes will download as soon as
                    you confirm. Codes are unique and can't be regenerated
                    — keep the file safe.
                </p>
            </div>

            <dl className='divide-y rounded-lg border'>
                <Row label='Provider' value={capitalize(s.provider)} />
                <Row
                    label='Configuration'
                    value={
                        plan
                            ? `${plan.cpu} vCPU · ${plan.memory} GB · ${plan.disk} GB · $${plan.priceMonthly.toFixed(2)}/mo (${plan.id})`
                            : s.planId
                    }
                />
                <Row label='Region' value={`${regionLabel} (${s.region})`} />
                <Row label='SKU kind' value={skuLabel} />
                <Row label='Codes in batch' value={String(s.count)} />
                <Row label='Seats per code' value={seatsLabel} />
                <Row label='Subscription window' value={validity} />
                <Row label='Partner' value={s.partnerName || '—'} />
                <Row
                    label='Display label'
                    value={s.tierLabel || '—'}
                />
            </dl>

            <div className='flex justify-between'>
                <Button
                    variant='outline'
                    onClick={goBack}
                    disabled={submitting}
                >
                    Back
                </Button>
                <Button onClick={handleMint} disabled={submitting}>
                    {submitting
                        ? 'Minting…'
                        : `Mint ${s.count} codes`}
                </Button>
            </div>
        </div>
    )
}

const Row: FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className='flex justify-between gap-4 px-4 py-3 text-sm'>
        <dt className='text-muted-foreground'>{label}</dt>
        <dd className='text-foreground text-right'>{value}</dd>
    </div>
)

const capitalize = (s: string): string =>
    s.charAt(0).toUpperCase() + s.slice(1)

export default StepReview