import type { FC, ReactNode } from 'react'
import type { AdminEntitySelection } from '@/ts/Interfaces'

import { Fragment, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { t } from '@openclaw/i18n'
import { userRole } from '@openclaw/shared'
import { useAuth } from '@/lib/auth'
import { ROUTES } from '@/lib'
import { useAdminStats, useProfile } from '@/hooks'
import { PageTitle, PageHeader } from '@/components'
import AppShell from '@/components/layout/AppShell'
import {
    AdminAnalyticsTab,
    AdminBillingTab,
    AdminClawsTab,
    AdminReferralsTab,
    AdminDetailModal,
    AdminSettingsTab,
    AdminActivationCodesTab
} from '@/components/admin'
import { Skeleton } from '@/components/ui'
import {
    UsersIcon,
    HardDrivesIcon,
    HandshakeIcon,
    ChartLineUpIcon,
    CreditCardIcon,
    GearIcon,
    KeyIcon
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import AdminUserSkeleton from '@/pages/AdminUserSkeleton'
import { UsersTab } from '@/pages/Admin/tabs'

// Six tabs is intentional — anything else (pending claws, ssh keys,
// volumes, waitlist, exports, emails) was removed because either the
// feature itself is gone (SSH keys) or the admin view was surfacing
// low-signal operational data that belongs in logs/DB, not the UI.
const ADMIN_TABS = {
    ANALYTICS: 'analytics',
    USERS: 'users',
    CLAWS: 'claws',
    REFERRALS: 'referrals',
    BILLING: 'billing',
    CODES: 'codes',
    SETTINGS: 'settings'
} as const

const Admin: FC = (): ReactNode => {
    const { loading: authLoading } = useAuth()
    const { data: profile, isLoading: isProfileLoading } = useProfile()
    const [searchParams, setSearchParams] = useSearchParams()
    const tabParam = searchParams.get('tab') || ADMIN_TABS.ANALYTICS
    const validTabs = Object.values(ADMIN_TABS) as string[]
    const activeTab = validTabs.includes(tabParam)
        ? tabParam
        : ADMIN_TABS.ANALYTICS
    const [selectedEntity, setSelectedEntity] =
        useState<AdminEntitySelection | null>(null)
    const isAdmin = profile?.role === userRole.admin
    const { data: stats } = useAdminStats()

    const setActiveTab = (tab: string) => {
        setSearchParams({ tab })
    }

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
            key: ADMIN_TABS.REFERRALS,
            icon: HandshakeIcon,
            label: t('admin.referralsTab'),
            count: stats?.referrals
        },
        {
            key: ADMIN_TABS.BILLING,
            icon: CreditCardIcon,
            label: t('admin.billingTab'),
            count: stats?.billing
        },
        {
            key: ADMIN_TABS.CODES,
            icon: KeyIcon,
            label: 'Activation codes'
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
                    <div className='grid gap-6 md:grid-cols-[200px_1fr]'>
                        <aside>
                            <h1 className='mb-4 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
                                Admin console
                            </h1>
                            <nav className='flex flex-col gap-0.5'>
                                {sections.map((section) => {
                                    const isActive = activeTab === section.key
                                    return (
                                        <button
                                            key={section.key}
                                            onClick={() =>
                                                !isActive &&
                                                setActiveTab(section.key)
                                            }
                                            disabled={isActive}
                                            className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                                                isActive
                                                    ? 'bg-foreground/10 text-foreground font-medium'
                                                    : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
                                            }`}
                                        >
                                            <span className='flex items-center gap-2'>
                                                <section.icon className='h-4 w-4 shrink-0' />
                                                {section.label}
                                            </span>
                                            {section.count !== undefined && (
                                                <span
                                                    className={`text-xs ${
                                                        isActive
                                                            ? 'text-foreground/70'
                                                            : 'text-muted-foreground/70'
                                                    }`}
                                                >
                                                    {section.count}
                                                </span>
                                            )}
                                        </button>
                                    )
                                })}
                            </nav>
                        </aside>

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
                                {activeTab === ADMIN_TABS.REFERRALS && (
                                    <AdminReferralsTab
                                        onSelectEntity={setSelectedEntity}
                                    />
                                )}
                                {activeTab === ADMIN_TABS.BILLING && (
                                    <AdminBillingTab
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
                                {activeTab === ADMIN_TABS.SETTINGS && (
                                    <AdminSettingsTab />
                                )}
                            </div>
                        </section>
                    </div>
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