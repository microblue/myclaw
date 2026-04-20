import type { FC, ReactNode } from 'react'
import type { Claw } from '@/ts/Interfaces'

import { useMemo } from 'react'
import { t } from '@openclaw/i18n'
import { userRole } from '@openclaw/shared'
import { usePreferencesStore } from '@/lib/store'
import {
    useClaws,
    useAdminClaws,
    useProfile
} from '@/hooks'
import { ErrorState, PageTitle } from '@/components'
import AppShell from '@/components/layout/AppShell'
import ClawsListView from '@/components/dashboard/ClawsListView'
import { useAuth } from '@/lib/auth'

const Dashboard: FC = (): ReactNode => {
    const { user, cachedProfile, isLocal } = useAuth()
    const { data: profile } = useProfile({
        enabled: !!user,
        staleTime: 1000 * 60 * 5
    })
    // `/claws` is per-user. Admins can still see the fleet via
    // `/admin?tab=claws`; surfacing other users' claws on the main
    // dashboard was confusing.
    const { adminMode: adminModeRaw } = usePreferencesStore()
    const isAdmin = profile?.role === userRole.admin
    const adminMode = !!isAdmin && adminModeRaw

    const displayName =
        profile?.name ||
        cachedProfile?.name ||
        (isLocal
            ? t('account.noNameSet')
            : user?.email || cachedProfile?.email || '')

    const {
        data: claws,
        isLoading: isClawsLoading,
        isError,
        refetch
    } = useClaws()
    const {
        data: adminClaws,
        isLoading: isAdminClawsLoading,
        isError: isAdminClawsError,
        refetch: refetchAdmin
    } = useAdminClaws(adminMode)

    const displayedClaws = useMemo((): Claw[] => {
        if (adminMode) return adminClaws || []
        return claws || []
    }, [claws, adminMode, adminClaws])

    const activeIsError = adminMode ? isAdminClawsError : isError
    const activeRefetch = adminMode ? refetchAdmin : refetch
    const isLoading = adminMode ? isAdminClawsLoading : isClawsLoading

    return (
        <AppShell>
            <PageTitle
                title={
                    adminMode ? t('dashboard.adminTitle') : t('dashboard.title')
                }
                description={
                    adminMode
                        ? t('dashboard.adminDescription')
                        : t('dashboard.description')
                }
                noIndex
            />
            {activeIsError ? (
                <div className='flex h-[calc(100vh-3.5rem)] items-center justify-center'>
                    <ErrorState
                        title={t('errors.failedToLoadClaws')}
                        description={t('errors.failedToLoadClawsDescription')}
                        onRetry={() => activeRefetch()}
                    />
                </div>
            ) : isLoading ? (
                <div className='flex h-[calc(100vh-3.5rem)] items-center justify-center'>
                    <div className='h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent opacity-50' />
                </div>
            ) : (
                <ClawsListView
                    claws={displayedClaws}
                    displayName={displayName}
                />
            )}
        </AppShell>
    )
}

export default Dashboard