import type { FC, FormEvent } from 'react'
import type { ActivationCodePreview } from '@/ts/Interfaces'

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import { PageTitle } from '@/components'
import { ROUTES, api } from '@/lib'
import { Button, Input, Label } from '@/components/ui'
import { usePreviewActivationCode, usePurchaseClaw, useToast } from '@/hooks'

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

const validityLabel = (months?: number | null) => {
    if (months == null) return 'Perpetual'
    if (months === 12) return '1 year'
    if (months % 12 === 0) return `${months / 12} years`
    return `${months} month${months === 1 ? '' : 's'}`
}

const RedeemCode: FC = () => {
    const navigate = useNavigate()
    const preview = usePreviewActivationCode()
    const purchase = usePurchaseClaw()
    const toast = useToast()

    const [code, setCode] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [validated, setValidated] = useState<{
        code: string
        preview: ActivationCodePreview
    } | null>(null)

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
                    ? `${ROUTES.CLAWS}?provisioning=${clawId}`
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
                description='Use a partner-issued code to deploy your Claw.'
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
                                your channel partner. No payment required —
                                your Claw will deploy immediately.
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
                                placeholder='GL-XXXX-XXXX-XXXX'
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
                                Ready to deploy
                            </h2>
                            <p className='text-muted-foreground mt-1 text-sm'>
                                Tier, region, and validity are all locked by
                                your activation code. One click and you're
                                done.
                            </p>
                        </div>

                        <dl className='divide-y rounded-lg border'>
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
                                value={validated.preview.provider || '—'}
                            />
                            <SummaryRow
                                label='Region'
                                value={validated.preview.region || '—'}
                            />
                            <SummaryRow
                                label='Validity'
                                value={validityLabel(
                                    validated.preview.validityMonths
                                )}
                            />
                        </dl>

                        <div className='flex justify-between'>
                            <Button
                                variant='outline'
                                onClick={() => {
                                    setValidated(null)
                                    setCode('')
                                }}
                            >
                                Use a different code
                            </Button>
                            <Button
                                onClick={handleDeploy}
                                disabled={purchase.isPending}
                            >
                                {purchase.isPending ? 'Deploying…' : 'Deploy'}
                            </Button>
                        </div>
                    </div>
                )}
            </main>
        </AppShell>
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