import type { FC, ReactNode } from 'react'

import { Fragment, useState, useEffect } from 'react'
import { t } from '@openclaw/i18n'
import { userRole } from '@openclaw/shared'
import { useAuth } from '@/lib/auth'
import { useUIStore, usePreferencesStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { useProfile, useUpdateProfile, useUserStats } from '@/hooks'
import {
    PageTitle,
    PageHeader,
    AccountProfileSection,
    AccountSettingsSection
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

    const [name, setName] = useState('')
    const [hasChanges, setHasChanges] = useState(false)

    const { data: profile } = useProfile({ enabled: !!user })
    const { data: userStats } = useUserStats()

    useEffect(() => {
        if (profile?.name) {
            setName(profile.name)
        }
    }, [profile?.name])

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

    const joinedDate = isLocal ? profile?.createdAt : user?.created_at

    return (
        <AppShell hideSidebar>
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