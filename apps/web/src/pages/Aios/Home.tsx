import type { FC } from 'react'
import type { Claw } from '@/ts/Interfaces'

import { useNavigate } from 'react-router-dom'
import { clawStatus } from '@openclaw/shared'
import {
    SparkleIcon,
    PlusIcon,
    CircleNotchIcon,
    ChatCircleDotsIcon,
    GearSixIcon,
    PowerIcon
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

                <div className='grid gap-6 sm:grid-cols-1 lg:grid-cols-2'>
                    {list.map((claw) => (
                        <DeviceTile
                            key={claw.id}
                            claw={claw}
                            onSettings={() => navigate(`/aios/${claw.id}`)}
                            onLaunch={() => {
                                // Tile click semantics: a running OS
                                // boots straight into the desktop
                                // (studio in a new tab); an instance
                                // that's still provisioning routes to
                                // the full-screen install splash so
                                // the user can watch progress instead
                                // of landing on the BIOS detail tabs.
                                if (claw.status === clawStatus.running) {
                                    const url = buildClawChatUrl(claw)
                                    if (url) {
                                        window.open(
                                            url,
                                            '_blank',
                                            'noopener'
                                        )
                                        return
                                    }
                                }
                                if (TRANSIENT_STATUSES.has(claw.status)) {
                                    navigate(`/aios/install/${claw.id}`)
                                    return
                                }
                                navigate(`/aios/${claw.id}`)
                            }}
                        />
                    ))}
                </div>
            </main>
        </AppShell>
    )
}

// Each AI OS instance renders as a "device tile" — meant to feel
// like a virtual machine icon in a hypervisor manager: window-chrome
// header, mock desktop body, status LED in the title bar, and a
// status footer with an explicit primary action. Tile body click
// boots the user into the desktop (= studio); the gear icon drops
// into the BIOS / settings detail page instead.
const DeviceTile: FC<{
    claw: Claw
    onLaunch: () => void
    onSettings: () => void
}> = ({ claw, onLaunch, onSettings }) => {
    const isTransient = TRANSIENT_STATUSES.has(claw.status)
    const isOnline = claw.status === clawStatus.running
    const isOff = claw.status === clawStatus.stopped
    const label = STATUS_LABEL[claw.status] ?? claw.status

    const ledColor = isOnline
        ? 'bg-emerald-500'
        : isTransient
          ? 'bg-amber-500'
          : isOff
            ? 'bg-muted-foreground/40'
            : 'bg-rose-500'
    const ledRing = isOnline
        ? 'shadow-[0_0_8px_rgba(16,185,129,0.5)]'
        : isTransient
          ? 'shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-pulse'
          : ''

    return (
        <article className='group border-border bg-card relative overflow-hidden rounded-2xl border shadow-sm transition-all hover:border-primary/40 hover:shadow-lg'>
            {/* Window chrome — three traffic-light dots + title bar
                that shows the instance name and status LED. */}
            <div className='border-border flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2.5'>
                <div className='flex items-center gap-2'>
                    <span className='h-2.5 w-2.5 rounded-full bg-rose-400/70' />
                    <span className='h-2.5 w-2.5 rounded-full bg-amber-400/70' />
                    <span className='h-2.5 w-2.5 rounded-full bg-emerald-400/70' />
                </div>
                <div className='flex items-center gap-2 truncate'>
                    <span className={`h-2 w-2 rounded-full ${ledColor} ${ledRing}`} />
                    <span className='text-foreground/80 truncate text-xs font-medium'>
                        {claw.name}
                    </span>
                </div>
                <button
                    type='button'
                    onClick={(e) => {
                        e.stopPropagation()
                        onSettings()
                    }}
                    aria-label='Open settings (BIOS)'
                    className='text-muted-foreground hover:text-foreground transition-colors'
                >
                    <GearSixIcon className='h-4 w-4' />
                </button>
            </div>

            {/* Mock desktop body — clicking this region "boots" into
                the OS (opens studio when running, drops to BIOS
                detail when not). Aspect-video keeps the tile feeling
                like a screen rather than a card. */}
            <button
                type='button'
                onClick={onLaunch}
                className='relative aspect-[16/9] w-full overflow-hidden text-left'
            >
                {/* Brand wash backdrop */}
                <div className='from-primary/15 via-primary/5 absolute inset-0 bg-gradient-to-br to-background' />
                <div className='absolute inset-0 [background-image:radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.18),transparent_60%),radial-gradient(circle_at_80%_70%,rgba(168,85,247,0.18),transparent_60%)]' />

                {/* Center stage: a stylized "boot logo" + tagline.
                    For online tiles we tease the chat as the desktop
                    surface; for off / transient ones we mirror the
                    state. */}
                <div className='relative flex h-full flex-col items-center justify-center gap-3 px-6 text-center'>
                    <div className='from-primary/40 to-primary/10 ring-primary/20 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg ring-1'>
                        <SparkleIcon
                            className='text-primary h-8 w-8'
                            weight='fill'
                        />
                    </div>
                    {isOnline && (
                        <div className='space-y-1'>
                            <p className='text-foreground text-sm font-semibold'>
                                Click to enter the desktop
                            </p>
                            <p className='text-muted-foreground text-xs'>
                                Opens the studio for {claw.name}
                            </p>
                        </div>
                    )}
                    {isTransient && (
                        <div className='flex flex-col items-center gap-1'>
                            <CircleNotchIcon className='text-primary h-5 w-5 animate-spin' />
                            <p className='text-foreground/80 text-sm font-medium'>
                                {label}…
                            </p>
                        </div>
                    )}
                    {isOff && (
                        <div className='flex flex-col items-center gap-1'>
                            <PowerIcon className='text-muted-foreground/60 h-5 w-5' />
                            <p className='text-muted-foreground text-sm font-medium'>
                                Powered off
                            </p>
                        </div>
                    )}
                    {!isOnline && !isTransient && !isOff && (
                        <p className='text-muted-foreground text-sm'>
                            {label}
                        </p>
                    )}
                </div>
            </button>

            {/* Footer = identification strip. Plan / region read
                the way a VM hypervisor would label hardware. */}
            <div className='border-border flex items-center justify-between gap-3 border-t px-4 py-3'>
                <div className='min-w-0'>
                    <h3 className='truncate text-sm font-semibold'>
                        {claw.name}
                    </h3>
                    <p className='text-muted-foreground truncate text-xs'>
                        {(claw.provider ?? 'AI OS').toUpperCase()} ·{' '}
                        {claw.location ?? '—'}
                    </p>
                </div>
                {isOnline ? (
                    <Button
                        size='sm'
                        onClick={onLaunch}
                        className='shrink-0 gap-1.5'
                    >
                        <ChatCircleDotsIcon className='h-4 w-4' />
                        Enter desktop
                    </Button>
                ) : (
                    <Button
                        size='sm'
                        variant='outline'
                        onClick={onSettings}
                        className='shrink-0 gap-1.5'
                    >
                        <GearSixIcon className='h-4 w-4' />
                        Manage
                    </Button>
                )}
            </div>
        </article>
    )
}

export default Home