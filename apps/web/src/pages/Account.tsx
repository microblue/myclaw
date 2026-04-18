import type { FC, ReactNode } from 'react'

import { Fragment, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { t } from '@openclaw/i18n'
import { userRole } from '@openclaw/shared'
import { useAuth } from '@/lib/auth'
import { useUIStore, usePreferencesStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { api } from '@/lib'
import {
    useProfile,
    useUpdateProfile,
    useUserStats,
    useLinkedProvider,
    PROFILE_QUERY_KEY
} from '@/hooks'
import {
    LicenseCard,
    PageTitle,
    PageHeader,
    AccountProfileSection,
    AccountSettingsSection,
    ConnectedAccountsSection
} from '@/components'
import AppShell from '@/components/layout/AppShell'
import { CircleNotchIcon } from '@phosphor-icons/react'

const Account: FC = (): ReactNode => {
    const {
        user,
        loading: authLoading,
        updateCachedProfile,
        isLocal
    } = useAuth()
    const { showToast } = useUIStore()
    const { adminMode, setAdminMode, openLinksWindowed, setOpenLinksWindowed } =
        usePreferencesStore()
    const queryClient = useQueryClient()

    const [searchParams, setSearchParams] = useSearchParams()
    const [name, setName] = useState('')
    const [hasChanges, setHasChanges] = useState(false)
    const [isPurchasingLicense, setIsPurchasingLicense] = useState(false)

    const { data: profile } = useProfile({ enabled: !!user })
    const { data: userStats } = useUserStats()

    const {
        linkingProvider,
        unlinkingProvider,
        providerBusy,
        handleLinkProvider,
        handleUnlinkProvider
    } = useLinkedProvider()

    useEffect(() => {
        if (profile?.name) {
            setName(profile.name)
        }
    }, [profile?.name])

    useEffect(() => {
        if (searchParams.get('payment') !== 'success') return
        showToast(t('license.paymentSuccess'), TOAST_TYPE.SUCCESS)
        queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY })
        setSearchParams({}, { replace: true })
    }, [])

    const handlePurchaseLicense = async () => {
        setIsPurchasingLicense(true)
        try {
            const { checkoutUrl } = await api.purchaseLicense()
            window.location.href = checkoutUrl
        } catch {
            showToast(t('license.failedToPurchase'), TOAST_TYPE.ERROR)
            setIsPurchasingLicense(false)
        }
    }

    const updateMutation = useUpdateProfile()

    const handleSave = () => {
        updateMutation.mutate(
            { name },
            {
                onSuccess: (data) => {
                    setName(data.name || '')
                    setHasChanges(false)
                    updateCachedProfile({ name: data.name })
                    showToast(
                        t('account.profileUpdatedSuccessfully'),
                        TOAST_TYPE.SUCCESS
                    )
                },
                onError: (err: Error) => {
                    showToast(
                        err.message || t('errors.failedToUpdateProfile'),
                        TOAST_TYPE.ERROR
                    )
                }
            }
        )
    }

    const handleNameChange = (value: string) => {
        setName(value)
        setHasChanges(value !== (profile?.name || ''))
    }

    const email = user?.email || profile?.email || ''

    const joinedDate = isLocal
        ? profile?.createdAt
        : user?.metadata?.creationTime

    return (
        <AppShell>
            <PageTitle
                title={t('account.title')}
                description={t('account.description')}
                noIndex
            />

            <main className='mx-auto w-full max-w-5xl px-4 py-6 md:px-6 md:py-8'>
                    {authLoading || !profile ? (
                        <div className='flex min-h-[60vh] items-center justify-center'>
                            <CircleNotchIcon className='text-primary h-8 w-8 animate-spin' />
                        </div>
                    ) : (
                        <Fragment>
                            <PageHeader
                                title={t('account.accountSettings')}
                                description={t('account.manageYourAccount')}
                            />

                            <AccountProfileSection
                                name={name}
                                profileName={profile?.name ?? null}
                                email={email}
                                isLocal={!!isLocal}
                                joinedDate={joinedDate}
                                clawCount={userStats?.clawCount ?? 0}
                                sshKeyCount={userStats?.sshKeyCount ?? 0}
                                hasChanges={hasChanges}
                                isPending={updateMutation.isPending}
                                onNameChange={handleNameChange}
                                onSave={handleSave}
                            />

                            <AccountSettingsSection
                                showLocal={!!isLocal}
                                showAdmin={false}
                                openLinksWindowed={openLinksWindowed}
                                setOpenLinksWindowed={setOpenLinksWindowed}
                                adminMode={adminMode}
                                setAdminMode={setAdminMode}
                            />

                            {profile?.role === userRole.admin && (
                                <div
                                    id='license'
                                    className='border-border bg-foreground/5 mt-6 scroll-mt-24 rounded-xl border p-4 backdrop-blur-sm sm:p-8'
                                >
                                    <div className='mb-6'>
                                        <h2 className='text-lg font-medium'>
                                            {t('license.pageTitle')}
                                        </h2>
                                        <p className='text-muted-foreground mt-1 text-sm'>
                                            {t('license.pageDescription')}
                                        </p>
                                    </div>

                                    <LicenseCard
                                        hasLicense={
                                            profile?.hasLicense ?? false
                                        }
                                        isPurchasing={isPurchasingLicense}
                                        onPurchase={handlePurchaseLicense}
                                    />

                                    <p className='text-muted-foreground mt-3 text-xs'>
                                        {t('license.permanentNote')}
                                    </p>
                                </div>
                            )}

                            <ConnectedAccountsSection
                                authMethods={profile?.authMethods}
                                linkingProvider={linkingProvider}
                                unlinkingProvider={unlinkingProvider}
                                providerBusy={providerBusy}
                                onLink={handleLinkProvider}
                                onUnlink={handleUnlinkProvider}
                            />

                            <AccountSettingsSection
                                showLocal={false}
                                showAdmin={
                                    !isLocal && profile?.role === userRole.admin
                                }
                                openLinksWindowed={openLinksWindowed}
                                setOpenLinksWindowed={setOpenLinksWindowed}
                                adminMode={adminMode}
                                setAdminMode={setAdminMode}
                            />
                        </Fragment>
                    )}
            </main>
        </AppShell>
    )
}

export default Account