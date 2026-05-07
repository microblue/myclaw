import type { FC } from 'react'
import type { Claw } from '@/ts/Interfaces'

import { useNavigate } from 'react-router-dom'
import { clawStatus } from '@openclaw/shared'
import {
    SparkleIcon,
    PlusIcon,
    CircleNotchIcon,
    ChatCircleDotsIcon
} from '@phosphor-icons/react'
import AppShell from '@/components/layout/AppShell'
import { ErrorState, PageTitle } from '@/components'
import { Button } from '@/components/ui'
import { useClaws, useProfile } from '@/hooks'
import { ROUTES } from '@/lib'
import { buildClawChatUrl } from '@/lib/clawUrl'
import { useAuth } from '@/lib/auth'

// /aios — end-user landing post-login. Per user direction this is
// the "foolproof" page: one obvious primary action (Setup MyClaw.One
// AI OS), and a clean grid of devices when the user has any. The
// older /claws Dashboard with its admin-mode toggle + verbose card
// chrome lives on at the legacy route for back-compat; this is the
// canonical end-user surface.
//
// Language deliberately drops the word "Claw" everywhere visible —
// users see "AI OS" instead. The schema column is still claw_id,
// but customer-facing copy talks about AI OS instances.

const TRANSIENT_STATUSES = new Set<string>([
    clawStatus.creating,
    clawStatus.configuring,
    clawStatus.initializing,
    clawStatus.starting,
    clawStatus.restarting,
    clawStatus.rebuilding,
    clawStatus.migrating
])

const STATUS_LABEL: Record<string, string> = {
    [clawStatus.running]: 'Online',
    [clawStatus.stopped]: 'Off',
    [clawStatus.creating]: 'Setting up',
    [clawStatus.configuring]: 'Setting up',
    [clawStatus.initializing]: 'Setting up',
    [clawStatus.starting]: 'Starting',
    [clawStatus.stopping]: 'Stopping',
    [clawStatus.restarting]: 'Restarting',
    [clawStatus.unreachable]: 'Unreachable',
    [clawStatus.deleting]: 'Removing'
}

const Home: FC = () => {
    const navigate = useNavigate()
    const { user, cachedProfile, isLocal } = useAuth()
    const { data: profile } = useProfile({
        enabled: !!user,
        staleTime: 1000 * 60 * 5
    })
    const { data: claws, isLoading, isError, refetch } = useClaws()

    const displayName =
        profile?.name ||
        cachedProfile?.name ||
        (isLocal ? '' : user?.email?.split('@')[0] || '')

    const list = claws ?? []
    const hasInstances = list.length > 0

    if (isError) {
        return (
            <AppShell hideSidebar>
                <PageTitle title='AI OS' noIndex />
                <div className='flex h-[calc(100vh-3.5rem)] items-center justify-center'>
                    <ErrorState
                        title='Could not load your AI OS instances'
                        description='Try again in a moment.'
                        onRetry={() => refetch()}
                    />
                </div>
            </AppShell>
        )
    }

    if (isLoading) {
        return (
            <AppShell hideSidebar>
                <PageTitle title='AI OS' noIndex />
                <div className='flex h-[calc(100vh-3.5rem)] items-center justify-center'>
                    <CircleNotchIcon className='h-6 w-6 animate-spin opacity-50' />
                </div>
            </AppShell>
        )
    }

    if (!hasInstances) {
        return (
            <AppShell hideSidebar>
                <PageTitle title='AI OS' noIndex />
                <main className='relative flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4'>
                    {/* Soft brand wash. Stays under the content but
                        gives the empty state a sense of place. */}
                    <div className='pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10' />
                    <div className='relative z-10 mx-auto flex max-w-xl flex-col items-center gap-6 py-16 text-center'>
                        <div className='from-primary/30 to-primary/5 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br shadow-lg shadow-primary/10'>
                            <SparkleIcon
                                className='text-primary h-12 w-12'
                                weight='fill'
                            />
                        </div>
                        <div className='space-y-3'>
                            <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>
                                {displayName
                                    ? `Welcome, ${displayName}`
                                    : 'Welcome'}
                            </h1>
                            <p className='text-muted-foreground mx-auto max-w-md text-base'>
                                Set up your own AI OS — a private machine
                                running your AI agents, your data, your
                                rules. Takes about three minutes.
                            </p>
                        </div>
                        <Button
                            onClick={() => navigate(ROUTES.AIOS_INSTALL)}
                            size='lg'
                            className='gap-2 px-6'
                        >
                            <SparkleIcon className='h-5 w-5' weight='fill' />
                            Setup MyClaw.One AI OS
                        </Button>
                        <p className='text-muted-foreground/70 text-xs'>
                            You'll need an activation code from your
                            partner or invite.
                        </p>
                    </div>
                </main>
            </AppShell>
        )
    }

    return (
        <AppShell hideSidebar>
            <PageTitle title='AI OS' noIndex />
            <main className='mx-auto w-full max-w-5xl px-4 py-8 md:px-6'>
                <header className='mb-8 flex items-end justify-between gap-4'>
                    <div>
                        <h1 className='text-2xl font-semibold tracking-tight md:text-3xl'>
                            {displayName
                                ? `Welcome back, ${displayName}`
                                : 'Welcome back'}
                        </h1>
                        <p className='text-muted-foreground mt-1 text-sm'>
                            {list.length === 1
                                ? 'You have 1 AI OS.'
                                : `You have ${list.length} AI OS instances.`}
                        </p>
                    </div>
                    <Button
                        onClick={() => navigate(ROUTES.AIOS_INSTALL)}
                        className='gap-2'
                    >
                        <PlusIcon className='h-4 w-4' weight='bold' />
                        Setup new
                    </Button>
                </header>

                <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                    {list.map((claw) => (
                        <DeviceCard
                            key={claw.id}
                            claw={claw}
                            onOpen={() => navigate(`/aios/${claw.id}`)}
                            onChat={() => {
                                const url = buildClawChatUrl(claw)
                                if (url)
                                    window.open(url, '_blank', 'noopener')
                            }}
                        />
                    ))}
                </div>
            </main>
        </AppShell>
    )
}

const DeviceCard: FC<{
    claw: Claw
    onOpen: () => void
    onChat: () => void
}> = ({ claw, onOpen, onChat }) => {
    const isTransient = TRANSIENT_STATUSES.has(claw.status)
    const isOnline = claw.status === clawStatus.running
    const label = STATUS_LABEL[claw.status] ?? claw.status

    return (
        <button
            type='button'
            onClick={onOpen}
            className='border-border bg-card hover:border-primary/40 hover:shadow-primary/5 group relative overflow-hidden rounded-2xl border p-6 text-left shadow-sm transition-all hover:shadow-md'
        >
            <div className='from-primary/0 to-primary/0 group-hover:from-primary/5 absolute inset-0 bg-gradient-to-br transition-colors' />
            <div className='relative space-y-4'>
                <div className='flex items-start justify-between gap-2'>
                    <div className='from-primary/20 to-primary/5 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br'>
                        <SparkleIcon
                            className='text-primary h-5 w-5'
                            weight='fill'
                        />
                    </div>
                    <span
                        className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                            isOnline
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : isTransient
                                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                  : 'bg-muted text-muted-foreground'
                        }`}
                    >
                        {isTransient && (
                            <CircleNotchIcon className='h-3 w-3 animate-spin' />
                        )}
                        {isOnline && (
                            <span className='h-1.5 w-1.5 rounded-full bg-emerald-500' />
                        )}
                        {label}
                    </span>
                </div>
                <div>
                    <h3 className='truncate text-base font-semibold'>
                        {claw.name}
                    </h3>
                    <p className='text-muted-foreground mt-0.5 text-xs'>
                        {claw.location ?? '—'} ·{' '}
                        {claw.provider ?? 'AI OS'}
                    </p>
                </div>
                {isOnline && (
                    <div
                        role='button'
                        tabIndex={0}
                        onClick={(e) => {
                            e.stopPropagation()
                            onChat()
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                e.stopPropagation()
                                onChat()
                            }
                        }}
                        className='border-border bg-background hover:border-primary/40 hover:bg-primary/5 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors'
                    >
                        <ChatCircleDotsIcon className='h-4 w-4' />
                        Open chat
                    </div>
                )}
            </div>
        </button>
    )
}

export default Home