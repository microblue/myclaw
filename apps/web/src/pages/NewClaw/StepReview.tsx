import type { FC } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ROUTES } from '@/lib'
import { Button } from '@/components/ui'

const StepReview: FC = () => {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()

    const goBack = () =>
        navigate(`${ROUTES.NEW_CLAW_PLAN}?${searchParams.toString()}`)

    return (
        <div className='space-y-6'>
            <div>
                <h2 className='text-2xl font-semibold'>Review and deploy</h2>
                <p className='text-muted-foreground mt-1 text-sm'>
                    Name + confirm + Deploy button — wired up in Step 5.
                </p>
            </div>
            <div className='rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground'>
                Summary and name field will render here.
            </div>
            <div className='flex justify-between'>
                <Button variant='outline' onClick={goBack}>
                    Back
                </Button>
                <Button disabled>Deploy</Button>
            </div>
        </div>
    )
}

export default StepReview