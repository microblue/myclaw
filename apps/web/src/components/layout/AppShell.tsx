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
    StorefrontIcon,
    ListIcon,
    XIcon,
    HouseIcon,
    SparkleIcon,
    CaretLeftIcon,
    CaretRightIcon,
    ChartLineUpIcon,
    UsersIcon,
    HardDrivesIcon,
    KeyIcon,
    BugIcon,
    GearIcon
} from '@phosphor-icons/react'

type Role = 'user' | 'admin' | 'partner'

type NavItem = {
    to: string
    label: string
    icon: Icon
    // If set, the item is only shown for the listed roles. Omit to show
    // for everyone (including end-users).
    roles?: Role[]
}

// The sidebar is route-aware: when the user is on /admin/* the
// sidebar shows the admin sub-menu directly (so admin lands with one
// flat nav, not a sidebar-inside-a-sidebar). Same idea applies to
// /partner/* once that grows beyond a single page.
//
// Per docs/aios-design.md §2: super-admin sees Admin (currently the
// /admin route). Channel partners see a parallel Partner entry that
// hits /partner. End-users see the standard list.
// End-user nav: "My AI OS" is the home (their list), Billing for
// subscription, Referrals for the affiliate program. Order matches
// the pyramid of how often a user actually clicks: home daily,
// billing monthly, referrals occasionally.
//
// Admin/partner each get a single top-level entry that takes them
// to their own dashboard root; once there, AppShell swaps the sidebar
// to the role's sub-menu (see ADMIN_NAV_ITEMS below).
const GLOBAL_NAV_ITEMS: NavItem[] = [
    {
        to: ROUTES.AIOS,
        label: 'My AI OS',
        icon: SquaresFourIcon,
        roles: ['user']
    },
    {
        to: ROUTES.BILLING,
        label: 'Billing',
        icon: ReceiptIcon,
        roles: ['user']
    },
    {
        to: ROUTES.AFFILIATE,
        label: 'Referrals',
        icon: HandshakeIcon,
        roles: ['user']
    },
    {
        to: ROUTES.ADMIN_ANALYTICS,
        label: 'Admin',
        icon: ShieldCheckIcon,
        roles: ['admin']
    },
    {
        to: ROUTES.PARTNER,
        label: 'Partner',
        icon: StorefrontIcon,
        roles: ['partner']
    }
]

// Admin section sub-nav. Surfaced in the sidebar when the URL is
// under /admin/*, replacing the global nav for that view. Was a
// nested second-sidebar inside the Admin page — flattened per user
// request so /admin = backend dashboard with one left rail.
const ADMIN_NAV_ITEMS: NavItem[] = [
    {
        to: ROUTES.ADMIN_ANALYTICS,
        label: 'Analytics',
        icon: ChartLineUpIcon,
        roles: ['admin']
    },
    {
        to: ROUTES.ADMIN_USERS,
        label: 'Users',
        icon: UsersIcon,
        roles: ['admin']
    },
    {
        to: ROUTES.ADMIN_FLEET,
        label: 'Fleet',
        icon: HardDrivesIcon,
        roles: ['admin']
    },
    {
        to: ROUTES.ADMIN_CODES,
        label: 'Activation codes',
        icon: KeyIcon,
        roles: ['admin']
    },
    {
        to: ROUTES.ADMIN_INSTALL_REPORTS,
        label: 'Install reports',
        icon: BugIcon,
        roles: ['admin']
    },
    {
        to: ROUTES.ADMIN_SETTINGS,
        label: 'Settings',
        icon: GearIcon,
        roles: ['admin']
    }
]

type Props = {
    children: ReactNode
    // Optional slot for page actions in the top bar (e.g. "Deploy new")
    pageActions?: ReactNode
    // When true, render only the top bar + content with no sidebar /
    // mobile drawer / left padding. Used by the consumer-facing /aios
    // home so it reads as a focused launcher rather than a dashboard.
    hideSidebar?: boolean
}

const AppShell: FC<Props> = ({ children, pageActions, hideSidebar }) => {
    const { signOut, isLocal } = useAuth()
    const { data: profile } = useProfile()
    const { openLinksWindowed, sidebarCollapsed, setSidebarCollapsed } =
        usePreferencesStore()
    const role: Role =
        profile?.role === userRole.admin
            ? 'admin'
            : profile?.role === userRole.partner
              ? 'partner'
              : 'user'
    const appVersion = useAppVersion(!!isLocal)
    const dropdownFooterLinks = useLocalFooterLinks(!!isLocal)

    const displayName =
        profile?.name || profile?.email || ''

    // When the URL is under /admin/*, render the admin sub-menu in
    // place of the global nav so the user gets a single flat sidebar
    // (was two stacked sidebars before — the AppShell global one and
    // the AdminPage internal one).
    const location = useLocation()
    const onAdminRoute =
        location.pathname === '/admin' ||
        location.pathname.startsWith('/admin/')
    const sourceItems =
        onAdminRoute && role === 'admin' ? ADMIN_NAV_ITEMS : GLOBAL_NAV_ITEMS
    const items = sourceItems.filter(
        (n) => !n.roles || n.roles.includes(role)
    )

    const [mobileOpen, setMobileOpen] = useState(false)

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

            {/* Desktop sidebar — hidden on mobile, omitted entirely
                when hideSidebar is set (consumer launcher view).
                Collapses to a 14 icon-only rail when the user toggles. */}
            {!hideSidebar && (
                <aside
                    className={`border-border bg-card fixed inset-y-0 left-0 z-30 hidden flex-col border-r transition-[width] md:flex ${
                        sidebarCollapsed ? 'w-14' : 'w-60'
                    }`}
                >
                    <SidebarContent
                        items={items}
                        collapsed={sidebarCollapsed}
                        onToggleCollapsed={() =>
                            setSidebarCollapsed(!sidebarCollapsed)
                        }
                    />
                </aside>
            )}

            {/* Mobile drawer */}
            {!hideSidebar && mobileOpen && (
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
            <div
                className={`relative z-10 flex min-h-screen flex-col transition-[padding] ${
                    hideSidebar
                        ? ''
                        : sidebarCollapsed
                          ? 'md:pl-14'
                          : 'md:pl-60'
                }`}
            >
                <TopBar
                    onMenu={hideSidebar ? undefined : () => setMobileOpen(true)}
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
    collapsed?: boolean
    onToggleCollapsed?: () => void
}> = ({ items, onClose, collapsed = false, onToggleCollapsed }) => {
    const navigate = useNavigate()

    return (
        <>
            <div
                className={`border-border flex h-14 items-center border-b ${
                    collapsed ? 'justify-center px-2' : 'justify-between px-4'
                }`}
            >
                {!collapsed && (
                    <button
                        type='button'
                        onClick={() => navigate(ROUTES.CLAWS)}
                        className='flex items-center gap-2'
                    >
                        <Logo />
                    </button>
                )}
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
                {onToggleCollapsed && (
                    <button
                        type='button'
                        onClick={onToggleCollapsed}
                        className='text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-md p-1.5'
                        aria-label={
                            collapsed ? 'Expand sidebar' : 'Collapse sidebar'
                        }
                        title={
                            collapsed ? 'Expand sidebar' : 'Collapse sidebar'
                        }
                    >
                        {collapsed ? (
                            <CaretRightIcon className='h-4 w-4' />
                        ) : (
                            <CaretLeftIcon className='h-4 w-4' />
                        )}
                    </button>
                )}
            </div>
            <nav className='flex-1 space-y-0.5 p-2'>
                {items.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === ROUTES.AIOS}
                        title={collapsed ? item.label : undefined}
                        className={({ isActive }) =>
                            `flex items-center rounded-md text-sm transition-colors ${
                                collapsed
                                    ? 'justify-center px-0 py-2.5'
                                    : 'gap-3 px-3 py-2'
                            } ${
                                isActive
                                    ? 'bg-foreground/10 text-foreground font-medium'
                                    : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
                            }`
                        }
                    >
                        {({ isActive }) => (
                            <>
                                <item.icon
                                    className='h-4 w-4 shrink-0'
                                    weight={isActive ? 'fill' : 'regular'}
                                />
                                {!collapsed && item.label}
                            </>
                        )}
                    </NavLink>
                ))}
            </nav>
        </>
    )
}

const TopBar: FC<{
    onMenu?: () => void
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
                {onMenu && (
                    <Button
                        variant='ghost'
                        size='icon'
                        className='md:hidden'
                        onClick={onMenu}
                        aria-label='Open menu'
                    >
                        <ListIcon className='h-5 w-5' />
                    </Button>
                )}
                <div className={onMenu ? 'md:hidden' : ''}>
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
                {/* Persistent entry point to platform release notes —
                    footer + dropdown were too buried (users said they
                    couldn't find /whats-new). Sparkle + the live
                    appVersion makes it act as both a "look, we shipped
                    something" indicator and a quick anchor to the
                    relevant page. */}
                <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => navigate(ROUTES.WHATS_NEW)}
                    className='text-muted-foreground hover:text-foreground hidden gap-1.5 sm:inline-flex'
                    aria-label="What's new"
                >
                    <SparkleIcon className='h-4 w-4' />
                    <span className='hidden sm:inline'>What&apos;s new</span>
                    {appVersion && (
                        <span className='text-muted-foreground/70 hidden font-mono text-xs md:inline'>
                            {appVersion}
                        </span>
                    )}
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