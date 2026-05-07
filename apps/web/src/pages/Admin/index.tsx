import type { FC, ReactNode } from 'react'
import type { AdminEntitySelection } from '@/ts/Interfaces'

import { Fragment, useEffect, useState } from 'react'
import {
    Navigate,
    useLocation,
    useNavigate,
    useSearchParams
} from 'react-router-dom'
import { t } from '@openclaw/i18n'
import { userRole } from '@openclaw/shared'
import { useAuth } from '@/lib/auth'
import { ROUTES } from '@/lib'
import { useAdminStats, useProfile } from '@/hooks'
import { PageTitle, PageHeader } from '@/components'
import AppShell from '@/components/layout/AppShell'
import {
    AdminAnalyticsTab,
    AdminClawsTab,
    AdminDetailModal,
    AdminSettingsTab,
    AdminActivationCodesTab,
    AdminInstallReportsTab
} from '@/components/admin'
import { Skeleton } from '@/components/ui'
import {
    UsersIcon,
    HardDrivesIcon,
    ChartLineUpIcon,
    GearIcon,
    KeyIcon,
    BugIcon
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'

import AdminUserSkeleton from '@/pages/AdminUserSkeleton'
import { UsersTab } from '@/pages/Admin/tabs'

// Six tabs is intentional — anything else (pending claws, ssh keys,
// volumes, waitlist, exports, emails) was removed because either the
// feature itself is gone (SSH keys) or the admin view was surfacing
// low-signal operational data that belongs in logs/DB, not the UI.
//
// Per docs/aios-design.md §3, each tab gets its own URL segment
// (`/admin/<section>`) instead of the legacy `?tab=` query pattern.
// The legacy URL is redirected in-app on load for back-compat.
const ADMIN_TABS = {
    ANALYTICS: 'analytics',
    USERS: 'users',
    CLAWS: 'fleet',
    CODES: 'codes',
    INSTALL_REPORTS: 'install-reports',
    SETTINGS: 'settings'
} as const

// Legacy `?tab=X` values mapped to the canonical sub-route segment.
// `claws` → `fleet` is the user-visible rename per design §3.
// `referrals` / `billing` were removed and quietly redirect to
// analytics so old bookmarks / inbound links don't 404.
const LEGACY_TAB_REDIRECT: Record<string, string> = {
    claws: 'fleet',
    analytics: 'analytics',
    users: 'users',
    fleet: 'fleet',
    referrals: 'analytics',
    billing: 'analytics',
    codes: 'codes',
    'install-reports': 'install-reports',
    settings: 'settings'
}

const Admin: FC = (): ReactNode => {
    const { loading: authLoading } = useAuth()
    const { data: profile, isLoading: isProfileLoading } = useProfile()
    const [searchParams] = useSearchParams()
    const location = useLocation()
    const navigate = useNavigate()
    // The active tab is the second URL segment: /admin/<tab>. Falls
    // back to analytics for the bare /admin landing.
    const segments = location.pathname.split('/').filter(Boolean)
    const fromPath =
        segments[0] === 'admin' && segments[1] ? segments[1] : ''
    const tabParam = searchParams.get('tab') || ''
    const validTabs = Object.values(ADMIN_TABS) as string[]
    const initialTab =
        fromPath && validTabs.includes(fromPath)
            ? fromPath
            : ADMIN_TABS.ANALYTICS
    const activeTab = initialTab

    // Legacy back-compat: if the URL is `/admin?tab=X` (or `/admin`
    // with no segment), rewrite to the canonical `/admin/<section>`
    // form so bookmarks / inbound links still land in the right
    // place. `replace: true` so the old URL doesn't pile up in
    // history.
    useEffect(() => {
        if (segments[0] !== 'admin') return
        if (!segments[1] && tabParam) {
            const target = LEGACY_TAB_REDIRECT[tabParam]
            if (target) {
                navigate(`/admin/${target}`, { replace: true })
            }
        }
    }, [segments, tabParam, navigate])
    const [selectedEntity, setSelectedEntity] =
        useState<AdminEntitySelection | null>(null)
    const isAdmin = profile?.role === userRole.admin
    const { data: stats } = useAdminStats()

    if (!authLoading && !isProfileLoading && !isAdmin)
        return <Navigate to={ROUTES.CLAWS} replace />

    const isPageLoading = authLoading || isProfileLoading

    const sections: {
        key: string
        icon: Icon
        label: string
        count?: number
    }[] = [
        {
            key: ADMIN_TABS.ANALYTICS,
            icon: ChartLineUpIcon,
            label: t('admin.analyticsTab')
        },
        {
            key: ADMIN_TABS.USERS,
            icon: UsersIcon,
            label: t('admin.usersTab'),
            count: stats?.users
        },
        {
            key: ADMIN_TABS.CLAWS,
            icon: HardDrivesIcon,
            label: t('admin.clawsTab'),
            count: stats?.claws
        },
        {
            key: ADMIN_TABS.CODES,
            icon: KeyIcon,
            label: 'Activation codes'
        },
        {
            key: ADMIN_TABS.INSTALL_REPORTS,
            icon: BugIcon,
            label: 'Install reports'
        },
        {
            key: ADMIN_TABS.SETTINGS,
            icon: GearIcon,
            label: 'Settings'
        }
    ]
    const activeSection = sections.find((s) => s.key === activeTab)

    return (
        <AppShell>
            <PageTitle
                title={t('admin.title')}
                description={t('admin.description')}
                noIndex
            />

            <div className='mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8'>
                {isPageLoading ? (
                    <Fragment>
                        <div className='mb-2 space-y-2'>
                            <Skeleton className='h-8 w-48' />
                            <Skeleton className='h-5 w-72' />
                        </div>
                        <div className='border-border bg-foreground/5 rounded-xl border p-4 sm:p-8'>
                            <div className='space-y-1.5'>
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <AdminUserSkeleton key={i} />
                                ))}
                            </div>
                        </div>
                    </Fragment>
                ) : (
                    <section>
                        {activeSection && (
                            <div className='mb-4'>
                                <PageHeader
                                    title={activeSection.label}
                                    description={t('admin.description')}
                                />
                            </div>
                        )}
                        <div className='border-border bg-foreground/5 rounded-xl border p-4 backdrop-blur-sm sm:p-6'>
                            {activeTab === ADMIN_TABS.CLAWS && (
                                <AdminClawsTab
                                    onSelectEntity={setSelectedEntity}
                                />
                            )}
                            {activeTab === ADMIN_TABS.ANALYTICS && (
                                <AdminAnalyticsTab />
                            )}
                            {activeTab === ADMIN_TABS.USERS && (
                                <UsersTab
                                    onSelectEntity={setSelectedEntity}
                                />
                            )}
                            {activeTab === ADMIN_TABS.CODES && (
                                <AdminActivationCodesTab />
                            )}
                            {activeTab === ADMIN_TABS.INSTALL_REPORTS && (
                                <AdminInstallReportsTab />
                            )}
                            {activeTab === ADMIN_TABS.SETTINGS && (
                                <AdminSettingsTab />
                            )}
                        </div>
                    </section>
                )}
            </div>

            <AdminDetailModal
                entity={selectedEntity}
                onClose={() => setSelectedEntity(null)}
                onNavigateToUser={(userId) =>
                    setSelectedEntity({
                        type: 'user',
                        id: userId,
                        data: null
                    })
                }
            />
        </AppShell>
    )
}

export default Admin