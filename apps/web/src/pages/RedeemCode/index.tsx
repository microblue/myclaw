import type { FC, FormEvent } from 'react'
import type { ActivationCodePreview, Claw } from '@/ts/Interfaces'

import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import { PageTitle } from '@/components'
import { ROUTES, api } from '@/lib'
import { Button, Input, Label } from '@/components/ui'
import {
    useClaws,
    usePreviewActivationCode,
    usePurchaseClaw,
    useToast
} from '@/hooks'

const reasonMessage = (reason?: string): string => {
    switch (reason) {
        case 'redeemed':
            return 'This code has already been redeemed.'
        case 'voided':
            return 'This code has been voided.'
        case 'expired':
            return 'This code has expired.'
        default:
            return 'We could not find that code. Double-check and try again.'
    }
}

const validityLabel = (days?: number | null) => {
    if (days == null) return 'Perpetual'
    if (days === 365) return '1 year'
    if (days % 365 === 0) return `${days / 365} years`
    if (days === 30) return '30 days'
    if (days === 7) return '7 days'
    return `${days} day${days === 1 ? '' : 's'}`
}

const seatsLabel = (used: number, total: number) =>
    total <= 1 ? 'single use' : `${total - used} of ${total} seats remaining`

const formatDate = (iso: string | null): string => {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    })
}

const RedeemCode: FC = () => {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const preview = usePreviewActivationCode()
    const purchase = usePurchaseClaw()
    const toast = useToast()
    const clawsQuery = useClaws()

    const extendsClawIdParam = searchParams.get('extends') || ''

    const [code, setCode] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [validated, setValidated] = useState<{
        code: string
        preview: ActivationCodePreview
    } | null>(null)
    const [chosenExtendsClawId, setChosenExtendsClawId] = useState(
        extendsClawIdParam
    )

    const myClaws = clawsQuery.data ?? []

    const isRenewal = validated?.preview.skuKind === 'renewal'

    const eligibleRenewalClaws = useMemo<Claw[]>(() => {
        if (!validated || !isRenewal) return []
        const targetPlan = validated.preview.planId
        const targetProvider = validated.preview.provider
        return myClaws.filter((c) => {
            if (targetPlan && c.planId !== targetPlan) return false
            if (targetProvider && c.provider !== targetProvider) return false
            return true
        })
    }, [validated, isRenewal, myClaws])

    const targetClaw = useMemo<Claw | null>(() => {
        if (!isRenewal) return null
        const id = chosenExtendsClawId || extendsClawIdParam
        if (!id) return null
        return myClaws.find((c) => c.id === id) ?? null
    }, [isRenewal, chosenExtendsClawId, extendsClawIdParam, myClaws])

    const handleValidate = async (e: FormEvent) => {
        e.preventDefault()
        const trimmed = code.trim()
        if (!trimmed) return
        setError(null)
        try {
            const result = await preview.mutateAsync(trimmed)
            if (!result.valid) {
                setError(reasonMessage(result.reason))
                return
            }
            setValidated({ code: trimmed, preview: result })
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Validation failed')
        }
    }

    const handleDeploy = async () => {
        if (!validated) return
        try {
            if (isRenewal) {
                if (!targetClaw) {
                    toast.error('Pick a Claw to extend.')
                    return
                }
                await purchase.mutateAsync({
                    activationCode: validated.code,
                    extendsClawId: targetClaw.id,
                    name: targetClaw.name
                })
                toast.success(
                    `Extended ${targetClaw.name} by ${validityLabel(validated.preview.validityDays)}.`
                )
                navigate(`${ROUTES.CLAWS}/${targetClaw.id}`)
                return
            }

            const suggested = await api.suggestClawName().catch(() => ({
                name: ''
            }))
            const result = await purchase.mutateAsync({
                activationCode: validated.code,
                name: suggested.name || 'my-claw'
            })
            toast.success('Deploying your Claw…')
            const clawId = result.pendingClawId
            navigate(
                clawId
                    ? `/install/${clawId}`
                    : ROUTES.CLAWS
            )
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Deploy failed'
            toast.error(message)
        }
    }

    return (
        <AppShell>
            <PageTitle
                title='Redeem activation code'
                description='Use a partner-issued code to deploy or renew your Claw.'
                noIndex
            />
            <main className='mx-auto w-full max-w-xl px-4 py-8 md:px-6'>
                {!validated ? (
                    <form className='space-y-6' onSubmit={handleValidate}>
                        <div>
                            <h2 className='text-2xl font-semibold'>
                                Redeem an activation code
                            </h2>
                            <p className='text-muted-foreground mt-1 text-sm'>
                                Paste the activation code you received from
                                your channel partner. Codes can deploy a new
                                Claw or extend an existing one.
                            </p>
                        </div>

                        <div className='space-y-2'>
                            <Label htmlFor='activation-code'>
                                Activation code
                            </Label>
                            <Input
                                id='activation-code'
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder='XXXXXXXXX-DDD-UUU'
                                autoComplete='off'
                                autoFocus
                            />
                            {error && (
                                <p className='text-destructive text-sm'>
                                    {error}
                                </p>
                            )}
                        </div>

                        <div className='flex justify-end'>
                            <Button
                                type='submit'
                                disabled={!code.trim() || preview.isPending}
                            >
                                {preview.isPending
                                    ? 'Validating…'
                                    : 'Continue'}
                            </Button>
                        </div>
                    </form>
                ) : (
                    <div className='space-y-6'>
                        <div>
                            <h2 className='text-2xl font-semibold'>
                                {isRenewal
                                    ? 'Renewal code'
                                    : 'Ready to deploy'}
                            </h2>
                            <p className='text-muted-foreground mt-1 text-sm'>
                                {isRenewal
                                    ? `This code adds ${validityLabel(validated.preview.validityDays)} to an existing Claw.`
                                    : "Tier, region, and validity are all locked by your activation code. One click and you're done."}
                            </p>
                        </div>

                        <dl className='divide-y rounded-lg border'>
                            <SummaryRow
                                label='SKU'
                                value={
                                    isRenewal ? 'Renewal' : 'New Claw deploy'
                                }
                            />
                            {!isRenewal && (
                                <>
                                    <SummaryRow
                                        label='Tier'
                                        value={
                                            validated.preview.tierLabel ||
                                            validated.preview.planId ||
                                            '—'
                                        }
                                    />
                                    <SummaryRow
                                        label='Provider'
                                        value={
                                            validated.preview.provider || '—'
                                        }
                                    />
                                    <SummaryRow
                                        label='Region'
                                        value={
                                            validated.preview.region || '—'
                                        }
                                    />
                                </>
                            )}
                            <SummaryRow
                                label='Subscription window'
                                value={validityLabel(
                                    validated.preview.validityDays
                                )}
                            />
                            <SummaryRow
                                label='Seats'
                                value={seatsLabel(
                                    validated.preview.seatsUsed ?? 0,
                                    validated.preview.seats ?? 1
                                )}
                            />
                        </dl>

                        {isRenewal && (
                            <RenewalTargetPicker
                                eligibleClaws={eligibleRenewalClaws}
                                allClaws={myClaws}
                                isLoading={clawsQuery.isLoading}
                                selectedId={chosenExtendsClawId}
                                onSelect={setChosenExtendsClawId}
                                preview={validated.preview}
                            />
                        )}

                        {isRenewal && targetClaw && (
                            <div className='bg-muted/40 rounded-lg border p-4 text-sm'>
                                <div className='font-medium'>
                                    Extending {targetClaw.name}
                                </div>
                                <div className='text-muted-foreground mt-1'>
                                    Current expiry:{' '}
                                    {formatDate(targetClaw.deletionScheduledAt)}{' '}
                                    → adds{' '}
                                    {validityLabel(
                                        validated.preview.validityDays
                                    )}
                                </div>
                            </div>
                        )}

                        <div className='flex justify-between'>
                            <Button
                                variant='outline'
                                onClick={() => {
                                    setValidated(null)
                                    setCode('')
                                    setChosenExtendsClawId('')
                                }}
                            >
                                Use a different code
                            </Button>
                            <Button
                                onClick={handleDeploy}
                                disabled={
                                    purchase.isPending ||
                                    (isRenewal && !targetClaw)
                                }
                            >
                                {purchase.isPending
                                    ? 'Working…'
                                    : isRenewal
                                      ? 'Apply renewal'
                                      : 'Deploy'}
                            </Button>
                        </div>
                    </div>
                )}
            </main>
        </AppShell>
    )
}

const RenewalTargetPicker: FC<{
    eligibleClaws: Claw[]
    allClaws: Claw[]
    isLoading: boolean
    selectedId: string
    onSelect: (id: string) => void
    preview: ActivationCodePreview
}> = ({ eligibleClaws, allClaws, isLoading, selectedId, onSelect, preview }) => {
    if (isLoading) {
        return (
            <p className='text-muted-foreground text-sm'>Loading your Claws…</p>
        )
    }
    if (allClaws.length === 0) {
        return (
            <p className='text-destructive text-sm'>
                You don't have any Claws yet. Renewal codes can only extend an
                existing Claw.
            </p>
        )
    }
    if (eligibleClaws.length === 0) {
        return (
            <div className='space-y-1 text-sm'>
                <p className='text-destructive'>
                    None of your Claws match this code.
                </p>
                <p className='text-muted-foreground text-xs'>
                    Renewal codes are tied to a specific plan
                    {preview.planId ? ` (${preview.planId})` : ''}
                    {preview.provider ? ` on ${preview.provider}` : ''}.
                </p>
            </div>
        )
    }
    return (
        <div className='space-y-2'>
            <Label htmlFor='extends-claw'>Pick a Claw to extend</Label>
            <select
                id='extends-claw'
                className='border-input bg-background w-full rounded-md border px-3 py-2 text-sm'
                value={selectedId}
                onChange={(e) => onSelect(e.target.value)}
            >
                <option value=''>— Choose one —</option>
                {eligibleClaws.map((c) => (
                    <option key={c.id} value={c.id}>
                        {c.name} ({c.planId})
                        {c.deletionScheduledAt
                            ? ` — expires ${formatDate(c.deletionScheduledAt)}`
                            : ''}
                    </option>
                ))}
            </select>
        </div>
    )
}

const SummaryRow: FC<{ label: string; value: string }> = ({
    label,
    value
}) => (
    <div className='flex justify-between px-4 py-3 text-sm'>
        <dt className='text-muted-foreground'>{label}</dt>
        <dd className='text-foreground text-right'>{value}</dd>
    </div>
)

export default RedeemCode