import type { FC, ReactNode } from 'react'
import type { Claw, ElectronWindow } from '@/ts/Interfaces'

import {
    Fragment,
    lazy,
    useState,
    useEffect,
    useMemo,
    useCallback
} from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { userRole } from '@openclaw/shared'
import { useUIStore, usePreferencesStore, useDashboardStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { ROUTES } from '@/lib'
import {
    useClaws,
    useAdminClaws,
    useProfile,
    useNetworkStatus,
    useAppVersion,
    useLocalFooterLinks,
    useURLStateRestoration
} from '@/hooks'
import {
    AnnouncementBanner,
    ErrorState,
    NetworkStatus,
    PageTitle,
    ProductHuntBanner
} from '@/components'
import { DashboardHeader } from '@/components/dashboard'
import ClawsListView from '@/components/dashboard/ClawsListView'
import { PlaygroundLoadingState } from '@/components/playground'
import { useAuth } from '@/lib/auth'

const CreateAgentModal = lazy(
    () => import('@/components/playground/CreateAgentModal')
)

const Dashboard: FC = (): ReactNode => {
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const [awaitingClaw, setAwaitingClaw] = useState(
        () => searchParams.get('payment') === 'success'
    )
    const {
        selectedClawId,
        setSelectedClawId,
        selectedAgentId,
        setSelectedAgentId,
        selectedAgentClawId,
        setSelectedAgentClawId,
        chatSelectedAgent,
        setChatSelectedAgent,
        chatSettingsClawId,
        setChatSettingsClawId,
        chatAgentTab,
        setChatAgentTab,
        playgroundAgentTab,
        setPlaygroundAgentTab,
        playgroundClawTab,
        setPlaygroundClawTab,
        chatClawTab,
        setChatClawTab,
        setShowCreate,
        setPreselectedPlanId,
        createAgentClawId,
        setCreateAgentClawId,
        createAgentClawName,
        setCreateAgentClawName
    } = useDashboardStore()
    const { showToast } = useUIStore()
    const {
        adminMode: adminModeRaw,
        dashboardTab,
        setDashboardTab,
        openLinksWindowed
    } = usePreferencesStore()

    const [minLoadingMet, setMinLoadingMet] = useState(false)

    useEffect(() => {
        const timer = setTimeout(() => setMinLoadingMet(true), 1500)
        return () => clearTimeout(timer)
    }, [])

    const {
        user,
        loading: authLoading,
        cachedProfile,
        signOut,
        isLocal
    } = useAuth()
    const { data: profile } = useProfile({
        enabled: !!user,
        staleTime: 1000 * 60 * 5
    })
    const isOffline = useNetworkStatus()
    const isAdmin = profile?.role === userRole.admin
    const adminMode = !!isAdmin && adminModeRaw

    const [dnsSetup, setDnsSetup] = useState<boolean | null>(null)
    const [dnsLoading, setDnsLoading] = useState(false)
    const appVersion = useAppVersion(!!isLocal)
    const dropdownFooterLinks = useLocalFooterLinks(!!isLocal)

    useEffect(() => {
        if (!isLocal) return
        const api = (window as unknown as ElectronWindow).electronAPI
        if (api?.getDnsStatus) {
            api.getDnsStatus().then(setDnsSetup)
        }
    }, [isLocal])

    const handleDnsSetup = useCallback(async () => {
        const api = (window as unknown as ElectronWindow).electronAPI
        if (!api?.setupDns) return
        setDnsLoading(true)
        try {
            const success = await api.setupDns()
            if (success) {
                setDnsSetup(true)
                showToast(t('dashboard.dnsSetupSuccess'), TOAST_TYPE.SUCCESS)
            } else {
                showToast(t('dashboard.dnsSetupError'), TOAST_TYPE.ERROR)
            }
        } catch {
            showToast(t('dashboard.dnsSetupError'), TOAST_TYPE.ERROR)
        }
        setDnsLoading(false)
    }, [showToast])

    const displayName =
        profile?.name ||
        cachedProfile?.name ||
        (isLocal
            ? t('account.noNameSet')
            : user?.email || cachedProfile?.email || '')

    useURLStateRestoration({
        searchParams,
        setSearchParams,
        dashboardTab,
        setDashboardTab,
        selectedClawId,
        setSelectedClawId,
        selectedAgentId,
        setSelectedAgentId,
        selectedAgentClawId,
        setSelectedAgentClawId,
        chatSelectedAgent,
        setChatSelectedAgent,
        chatSettingsClawId,
        setChatSettingsClawId,
        chatAgentTab,
        setChatAgentTab,
        playgroundAgentTab,
        setPlaygroundAgentTab,
        playgroundClawTab,
        setPlaygroundClawTab,
        chatClawTab,
        setChatClawTab,
        setShowCreate,
        setPreselectedPlanId,
        showToast,
        awaitingClaw
    })

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

    useEffect(() => {
        if (awaitingClaw && !isClawsLoading) {
            setAwaitingClaw(false)
        }
    }, [awaitingClaw, isClawsLoading])

    const displayedClaws = useMemo((): Claw[] => {
        if (adminMode) return adminClaws || []
        return claws || []
    }, [claws, adminMode, adminClaws])

    const activeClawsLoading = adminMode ? isAdminClawsLoading : isClawsLoading
    const activeIsError = adminMode ? isAdminClawsError : isError
    const activeRefetch = adminMode ? refetchAdmin : refetch
    const isLoading =
        authLoading || activeClawsLoading || (!awaitingClaw && !minLoadingMet)

    const showFullBackground = activeIsError || isLoading

    const handleCreateClick = useCallback(() => {
        navigate(ROUTES.NEW_CLAW)
    }, [navigate])

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className={`bg-background text-foreground fixed inset-0 flex flex-col ${showFullBackground && !isLocal ? 'playground-grid' : ''}`}
        >
            {isOffline ? (
                <NetworkStatus />
            ) : (
                <Fragment>
                    <ProductHuntBanner />
                    {!isLocal && <AnnouncementBanner />}
                </Fragment>
            )}
            {isLocal && showFullBackground && (
                <div className='playground-grid pointer-events-none fixed inset-0 opacity-50' />
            )}
            <div
                className={`playground-gradient pointer-events-none fixed inset-0 ${isLocal ? 'opacity-30' : ''}`}
            />
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

            <DashboardHeader
                dashboardTab={dashboardTab}
                isLocal={!!isLocal}
                isLoading={isLoading}
                displayedClaws={displayedClaws}
                displayName={displayName}
                dnsSetup={dnsSetup}
                dnsLoading={dnsLoading}
                openLinksWindowed={openLinksWindowed}
                appVersion={appVersion}
                dropdownFooterLinks={dropdownFooterLinks || []}
                onTabChange={setDashboardTab}
                onCreateClick={handleCreateClick}
                onDnsSetup={handleDnsSetup}
                onSignOut={signOut}
            />

            <div className='flex flex-1 overflow-hidden'>
                {activeIsError ? (
                    <div className='flex h-full min-w-0 flex-1 items-center justify-center'>
                        <div className='-mt-20'>
                            <ErrorState
                                title={t('errors.failedToLoadClaws')}
                                description={t(
                                    'errors.failedToLoadClawsDescription'
                                )}
                                onRetry={() => activeRefetch()}
                            />
                        </div>
                    </div>
                ) : isLoading ? (
                    <div className='flex h-full min-w-0 flex-1 items-center justify-center'>
                        <PlaygroundLoadingState />
                    </div>
                ) : (
                    <div className='w-full overflow-auto'>
                        <ClawsListView
                            claws={displayedClaws}
                            displayName={displayName}
                        />
                    </div>
                )}
            </div>

            {createAgentClawId && (
                <CreateAgentModal
                    clawId={createAgentClawId}
                    clawName={createAgentClawName}
                    open={!!createAgentClawId}
                    onOpenChange={(open) => {
                        if (!open) {
                            setCreateAgentClawId(null)
                            setCreateAgentClawName('')
                        }
                    }}
                />
            )}
        </motion.div>
    )
}

export default Dashboard