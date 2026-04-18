import type { FC } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ROUTES } from '@/lib'
import AppShell from '@/components/layout/AppShell'
import { Button } from '@/components/ui'

const STEPS: { path: string; label: string }[] = [
    { path: ROUTES.NEW_CLAW, label: 'Claw' },
    { path: ROUTES.NEW_CLAW_PROVIDER, label: 'Provider' },
    { path: ROUTES.NEW_CLAW_PLAN, label: 'Configuration' },
    { path: ROUTES.NEW_CLAW_REVIEW, label: 'Review' }
]

const WizardShell: FC = () => {
    const location = useLocation()
    const navigate = useNavigate()

    const currentIndex = Math.max(
        0,
        STEPS.findIndex((s) => s.path === location.pathname)
    )

    const backAction = (
        <Button
            variant='ghost'
            size='sm'
            onClick={() => navigate(ROUTES.CLAWS)}
        >
            Cancel
        </Button>
    )

    return (
        <AppShell pageActions={backAction}>
            <div className='mx-auto w-full max-w-4xl px-4 py-6 md:px-6 md:py-8'>
                <div className='mb-8'>
                    <h1 className='text-xl font-semibold md:text-2xl'>
                        Deploy a new Claw
                    </h1>
                    <div className='mt-4 flex gap-2'>
                        {STEPS.map((step, i) => (
                            <div
                                key={step.path}
                                className='flex flex-1 flex-col gap-1'
                            >
                                <div
                                    className={`h-1 rounded-full transition-colors ${
                                        i <= currentIndex
                                            ? 'bg-primary'
                                            : 'bg-muted'
                                    }`}
                                />
                                <span
                                    className={`text-xs ${
                                        i <= currentIndex
                                            ? 'text-foreground'
                                            : 'text-muted-foreground'
                                    }`}
                                >
                                    {i + 1}. {step.label}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
                <Outlet />
            </div>
        </AppShell>
    )
}

export default WizardShell