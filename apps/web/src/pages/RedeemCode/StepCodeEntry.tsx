import type { FC, FormEvent } from 'react'
import type { ActivationCodePreview } from '@/ts/Interfaces'

import { useState } from 'react'
import { Button, Input, Label } from '@/components/ui'
import { usePreviewActivationCode } from '@/hooks'

interface Props {
    onValid: (code: string, preview: ActivationCodePreview) => void
}

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

const StepCodeEntry: FC<Props> = ({ onValid }) => {
    const [code, setCode] = useState('')
    const [error, setError] = useState<string | null>(null)
    const preview = usePreviewActivationCode()

    const handleSubmit = async (e: FormEvent) => {
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
            onValid(trimmed, result)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Validation failed')
        }
    }

    return (
        <form className='space-y-6' onSubmit={handleSubmit}>
            <div>
                <h2 className='text-2xl font-semibold'>Redeem an activation code</h2>
                <p className='text-muted-foreground mt-1 text-sm'>
                    Paste the activation code you received from your channel partner.
                    No payment is required — your Claw will deploy immediately.
                </p>
            </div>

            <div className='space-y-2'>
                <Label htmlFor='activation-code'>Activation code</Label>
                <Input
                    id='activation-code'
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder='GL-XXXX-XXXX-XXXX'
                    autoComplete='off'
                    autoFocus
                />
                {error && (
                    <p className='text-destructive text-sm'>{error}</p>
                )}
            </div>

            <div className='flex justify-end'>
                <Button
                    type='submit'
                    disabled={!code.trim() || preview.isPending}
                >
                    {preview.isPending ? 'Validating…' : 'Continue'}
                </Button>
            </div>
        </form>
    )
}

export default StepCodeEntry