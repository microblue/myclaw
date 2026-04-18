import type { FC, ReactNode } from 'react'
import type { LandingDemoPreviewProps } from '@/ts/Interfaces'
import { Logo } from '@/components/layout'
import { LockIcon } from '@phosphor-icons/react'

// Placeholder marketing preview. The previous version embedded the
// full in-app chat/playground views as a live demo; those surfaces
// were retired, so this file now renders a static dashboard mock.
// A richer preview returns in the marketing tone pass.

const LandingDemoPreview: FC<LandingDemoPreviewProps> = ({
    urlOverride,
    hideTitleBar = false
}): ReactNode => {
    return (
        <div className='border-border bg-card overflow-hidden rounded-xl border shadow-lg'>
            {!hideTitleBar && (
                <div className='border-border bg-muted flex items-center justify-between border-b px-4 py-2'>
                    <div className='flex items-center gap-1.5'>
                        <span className='h-2.5 w-2.5 rounded-full bg-red-400/70' />
                        <span className='h-2.5 w-2.5 rounded-full bg-yellow-400/70' />
                        <span className='h-2.5 w-2.5 rounded-full bg-green-400/70' />
                    </div>
                    <div className='text-muted-foreground flex items-center gap-1.5 text-xs'>
                        <LockIcon className='h-3 w-3' weight='fill' />
                        {urlOverride || 'myclaw.one/claws'}
                    </div>
                    <div className='w-10' />
                </div>
            )}
            <div className='flex min-h-[420px]'>
                <aside className='border-border bg-muted/30 hidden w-56 border-r p-4 md:block'>
                    <Logo />
                    <nav className='mt-4 space-y-1 text-sm'>
                        <FakeNavItem label='Instances' active />
                        <FakeNavItem label='SSH keys' />
                        <FakeNavItem label='Billing' />
                        <FakeNavItem label='Referrals' />
                        <FakeNavItem label='Account' />
                    </nav>
                </aside>
                <main className='flex-1 p-6'>
                    <h3 className='text-lg font-semibold'>Welcome back</h3>
                    <p className='text-muted-foreground mt-1 text-xs'>
                        You have 3 instances.
                    </p>
                    <div className='mt-4 grid gap-3 sm:grid-cols-2'>
                        <DemoCard name='happy-panda' status='running' />
                        <DemoCard name='cozy-otter' status='running' />
                        <DemoCard name='swift-fox' status='paused' />
                    </div>
                </main>
            </div>
        </div>
    )
}

const FakeNavItem: FC<{ label: string; active?: boolean }> = ({
    label,
    active
}) => (
    <div
        className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs ${
            active ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground'
        }`}
    >
        <span className='h-1.5 w-1.5 rounded-full bg-current opacity-60' />
        {label}
    </div>
)

const DemoCard: FC<{ name: string; status: 'running' | 'paused' }> = ({
    name,
    status
}) => (
    <div className='bg-card rounded-lg border p-4 text-sm'>
        <div className='flex items-center gap-2'>
            <span
                className={`h-2 w-2 rounded-full ${
                    status === 'running' ? 'bg-green-500' : 'bg-muted-foreground'
                }`}
            />
            <span className='font-medium'>{name}</span>
        </div>
        <dl className='text-muted-foreground mt-3 space-y-0.5 text-xs'>
            <div className='flex justify-between'>
                <dt>Provider</dt>
                <dd className='text-foreground'>Hetzner</dd>
            </div>
            <div className='flex justify-between'>
                <dt>Plan</dt>
                <dd className='text-foreground'>CX33</dd>
            </div>
        </dl>
    </div>
)

export default LandingDemoPreview