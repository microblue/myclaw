import type { FC } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ROUTES } from '@/lib'

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

    return (
        <div className='bg-background min-h-screen'>
            <header className='border-b'>
                <div className='mx-auto flex max-w-4xl items-center justify-between px-6 py-4'>
                    <button
                        type='button'
                        onClick={() => navigate(ROUTES.CLAWS)}
                        className='text-muted-foreground hover:text-foreground text-sm'
                    >
                        ← Back to dashboard
                    </button>
                    <h1 className='font-semibold'>Deploy a new Claw</h1>
                    <div className='w-32' />
                </div>
                <div className='mx-auto flex max-w-4xl gap-2 px-6 pb-4'>
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
            </header>
            <main className='mx-auto max-w-4xl px-6 py-10'>
                <Outlet />
            </main>
        </div>
    )
}

export default WizardShell