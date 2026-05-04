import type { FC } from 'react'
import type { ActivationCodePreview } from '@/ts/Interfaces'

import { useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { PageTitle } from '@/components'
import StepCodeEntry from '@/pages/RedeemCode/StepCodeEntry'
import StepConfirm from '@/pages/RedeemCode/StepConfirm'

interface ValidatedCode {
    code: string
    preview: ActivationCodePreview
}

const RedeemCode: FC = () => {
    const [validated, setValidated] = useState<ValidatedCode | null>(null)

    return (
        <AppShell>
            <PageTitle
                title='Redeem activation code'
                description='Use a partner-issued code to deploy your Claw.'
                noIndex
            />
            <main className='mx-auto w-full max-w-xl px-4 py-8 md:px-6'>
                {!validated ? (
                    <StepCodeEntry
                        onValid={(code, preview) =>
                            setValidated({ code, preview })
                        }
                    />
                ) : (
                    <StepConfirm
                        code={validated.code}
                        preview={validated.preview}
                        onBack={() => setValidated(null)}
                    />
                )}
            </main>
        </AppShell>
    )
}

export default RedeemCode