import type { FC, ReactNode } from 'react'
import type { FooterLink } from '@/ts/Interfaces'

import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { userRole } from '@openclaw/shared'
import { ROUTES } from '@/lib'
import { useAuth } from '@/lib/auth'
import { useProfile, useAppVersion, useLocalFooterLinks } from '@/hooks'
import { usePreferencesStore } from '@/lib/store'
import Logo from '@/components/layout/Logo'
import UserDropdown from '@/components/shared/UserDropdown'
import { Button } from '@/components/ui'
import type { Icon } from '@phosphor-icons/react'
import {
    SquaresFourIcon,
    ReceiptIcon,
    HandshakeIcon,
    ShieldCheckIcon,
    ListIcon,
    XIcon,
    HouseIcon
} from '@phosphor-icons/react'

type NavItem = {
    to: string
    label: string
    icon: Icon
    adminOnly?: boolean
}

// Sidebar is the primary nav for logged-in users. Account is
// intentionally NOT here — it lives in the header avatar dropdown
// (standard SaaS pattern, frees a slot in a list of otherwise
// high-frequency destinations).
const NAV_ITEMS: NavItem[] = [
    { to: ROUTES.CLAWS, label: 'Claws', icon: SquaresFourIcon },
    { to: ROUTES.BILLING, label: 'Billing', icon: ReceiptIcon },
    { to: ROUTES.AFFILIATE, label: 'Referrals', icon: HandshakeIcon },
    { to: ROUTES.ADMIN, label: 'Admin', icon: ShieldCheckIcon, adminOnly: true }
]

type Props = {
    children: ReactNode
    // Optional slot for page actions in the top bar (e.g. "Deploy new")
    pageActions?: ReactNode
}

const AppShell: FC<Props> = ({ children, pageActions }) => {
    const { signOut, isLocal } = useAuth()
    const { data: profile } = useProfile()
    const { openLinksWindowed } = usePreferencesStore()
    const isAdmin = profile?.role === userRole.admin
    const appVersion = useAppVersion(!!isLocal)
    const dropdownFooterLinks = useLocalFooterLinks(!!isLocal)

    const displayName =
        profile?.name || profile?.email || ''

    const items = NAV_ITEMS.filter((n) => !n.adminOnly || isAdmin)

    const [mobileOpen, setMobileOpen] = useState(false)
    const location = useLocation()

    // Close drawer on route change
    useEffect(() => {
        setMobileOpen(false)
    }, [location.pathname])

    // Close drawer on Escape
    useEffect(() => {
        if (!mobileOpen) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setMobileOpen(false)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [mobileOpen])

    return (
        <div className='bg-background text-foreground relative min-h-screen'>
            {/* Soft brand gradient behind everything (echoes the landing page
                treatment). The sidebar is opaque bg-card so the gradient only
                peeks through in the main content column. */}
            <div className='landing-gradient pointer-events-none fixed inset-0 z-0' />

            {/* Desktop sidebar — hidden on mobile */}
            <aside className='border-border bg-card fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r md:flex'>
                <SidebarContent items={items} />
            </aside>

            {/* Mobile drawer */}
            {mobileOpen && (
                <>
                    <div
                        className='fixed inset-0 z-40 bg-black/40 md:hidden'
                        onClick={() => setMobileOpen(false)}
                        aria-hidden
                    />
                    <aside className='border-border bg-card fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r md:hidden'>
                        <SidebarContent
                            items={items}
                            onClose={() => setMobileOpen(false)}
                        />
                    </aside>
                </>
            )}

            {/* Content column */}
            <div className='relative z-10 flex min-h-screen flex-col md:pl-60'>
                <TopBar
                    onMenu={() => setMobileOpen(true)}
                    pageActions={pageActions}
                    displayName={displayName}
                    appVersion={appVersion}
                    dropdownFooterLinks={dropdownFooterLinks || []}
                    openLinksWindowed={openLinksWindowed}
                    isLocal={!!isLocal}
                    onSignOut={signOut}
                />
                <main className='relative flex-1'>
                    <div className='landing-grid pointer-events-none absolute inset-x-0 top-0 h-[28rem] opacity-60' />
                    <div className='relative'>{children}</div>
                </main>
            </div>
        </div>
    )
}

const SidebarContent: FC<{
    items: NavItem[]
    onClose?: () => void
}> = ({ items, onClose }) => {
    const navigate = useNavigate()

    return (
        <>
            <div className='border-border flex h-14 items-center justify-between border-b px-4'>
                <button
                    type='button'
                    onClick={() => navigate(ROUTES.CLAWS)}
                    className='flex items-center gap-2'
                >
                    <Logo />
                </button>
                {onClose && (
                    <button
                        type='button'
                        onClick={onClose}
                        className='text-muted-foreground hover:text-foreground p-1'
                        aria-label='Close menu'
                    >
                        <XIcon className='h-5 w-5' />
                    </button>
                )}
            </div>
            <nav className='flex-1 space-y-0.5 p-3'>
                {items.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === ROUTES.CLAWS}
                        className={({ isActive }) =>
                            `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                                isActive
                                    ? 'bg-foreground/10 text-foreground font-medium'
                                    : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
                            }`
                        }
                    >
                        {({ isActive }) => (
                            <>
                                <item.icon
                                    className='h-4 w-4'
                                    weight={isActive ? 'fill' : 'regular'}
                                />
                                {item.label}
                            </>
                        )}
                    </NavLink>
                ))}
            </nav>
        </>
    )
}

const TopBar: FC<{
    onMenu: () => void
    pageActions?: ReactNode
    displayName: string
    appVersion: string | null
    dropdownFooterLinks: FooterLink[]
    openLinksWindowed: boolean
    isLocal: boolean
    onSignOut: () => Promise<void>
}> = ({
    onMenu,
    pageActions,
    displayName,
    appVersion,
    dropdownFooterLinks,
    openLinksWindowed,
    isLocal,
    onSignOut
}) => {
    const navigate = useNavigate()
    return (
        <header className='border-border bg-background/80 sticky top-0 z-20 flex h-14 items-center justify-between border-b px-4 backdrop-blur md:px-6'>
            <div className='flex items-center gap-3'>
                <Button
                    variant='ghost'
                    size='icon'
                    className='md:hidden'
                    onClick={onMenu}
                    aria-label='Open menu'
                >
                    <ListIcon className='h-5 w-5' />
                </Button>
                <div className='md:hidden'>
                    <Logo />
                </div>
            </div>
            <div className='flex items-center gap-2'>
                {/* One-click back to the marketing site. Dashboard
                    link is redundant (sidebar "Claws" handles it and
                    shows active state), so it's gone. */}
                <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => navigate(ROUTES.HOME)}
                    className='text-muted-foreground hover:text-foreground gap-1.5'
                    aria-label='Home'
                >
                    <HouseIcon className='h-4 w-4' />
                    <span className='hidden sm:inline'>Home</span>
                </Button>
                {pageActions}
                <UserDropdown
                    displayName={displayName}
                    onSignOut={onSignOut}
                    variant='app'
                    appVersion={appVersion ?? undefined}
                    footerLinks={isLocal ? dropdownFooterLinks : []}
                    openLinksWindowed={openLinksWindowed}
                />
            </div>
        </header>
    )
}

export default AppShell