import type { FC, ReactNode } from 'react'

import { useState } from 'react'
import { t } from '@openclaw/i18n'
import { useSSHKeys, useUserStats } from '@/hooks'
import {
    EmptyState,
    ErrorState,
    PageTitle,
    PageHeader,
    ActionButton
} from '@/components'
import AppShell from '@/components/layout/AppShell'
import {
    SSHKeySkeleton,
    SSHKeyCard,
    CreateSSHKeyModal
} from '@/components/ssh-keys'
import { PlusCircleIcon, KeyIcon, CaretDownIcon } from '@phosphor-icons/react'

const SSHKeys: FC = (): ReactNode => {
    const [showCreate, setShowCreate] = useState(false)
    const { data: sshKeys, isLoading, isError, refetch } = useSSHKeys()
    const { data: userStats, isLoading: isStatsLoading } = useUserStats()
    const skeletonCount = userStats?.sshKeyCount ?? 0
    const knowsCount = !isStatsLoading && userStats !== undefined

    const [howItWorksOpen, setHowItWorksOpen] = useState(false)

    const headerAction =
        sshKeys && sshKeys.length > 0 ? (
            <ActionButton
                onClick={() => setShowCreate(true)}
                icon={<PlusCircleIcon className='h-5 w-5' weight='bold' />}
                label={t('sshKeys.addSshKey')}
            />
        ) : undefined

    return (
        <AppShell>
            <PageTitle
                title={t('sshKeys.title')}
                description={t('sshKeys.description')}
                noIndex
            />
            <main className='mx-auto w-full max-w-5xl px-4 py-6 md:px-6 md:py-8'>
                <PageHeader
                    title={t('sshKeys.title')}
                    description={`${sshKeys?.length ?? 0} ${sshKeys?.length === 1 ? t('sshKeys.key') : t('sshKeys.keys')}`}
                    action={headerAction}
                />

                <div className='bg-card rounded-xl border p-6 md:p-8'>
                    <div className='bg-muted mb-6 rounded-lg'>
                        <button
                            type='button'
                            onClick={() => setHowItWorksOpen(!howItWorksOpen)}
                            className='flex w-full items-center justify-between p-4 text-left'
                        >
                            <h3 className='font-semibold'>
                                {t('sshKeys.howSshKeysWork')}
                            </h3>
                            <CaretDownIcon
                                className={`text-muted-foreground h-4 w-4 transition-transform ${howItWorksOpen ? 'rotate-180' : ''}`}
                                weight='bold'
                            />
                        </button>
                        {howItWorksOpen && (
                            <ol className='text-muted-foreground list-inside list-decimal space-y-1 px-4 pb-4 text-sm'>
                                <li>{t('sshKeys.step1')}</li>
                                <li>
                                    {t('sshKeys.step2').split('public key')[0]}
                                    <strong className='text-foreground'>
                                        public key
                                    </strong>
                                    {t('sshKeys.step2').split('public key')[1] || ' here.'}
                                </li>
                                <li>{t('sshKeys.step3')}</li>
                                <li>
                                    {t('sshKeys.step4')}{' '}
                                    <code className='bg-foreground/10 rounded px-1'>
                                        {t('sshKeys.step4Command')}
                                    </code>{' '}
                                    {t('sshKeys.step4Suffix')}
                                </li>
                            </ol>
                        )}
                    </div>

                    {isError ? (
                        <ErrorState
                            title={t('errors.failedToLoadSSHKeys')}
                            description={t('errors.failedToLoadSSHKeysDescription')}
                            onRetry={() => refetch()}
                        />
                    ) : isLoading && knowsCount && skeletonCount === 0 ? (
                        <EmptyState
                            icon={<KeyIcon className='text-primary h-10 w-10' />}
                            title={t('sshKeys.noSshKeysYet')}
                            description={t('sshKeys.noSshKeysDescription')}
                            actionLabel={t('sshKeys.addSshKey')}
                            actionIcon={<PlusCircleIcon className='h-5 w-5' weight='bold' />}
                            onAction={() => setShowCreate(true)}
                        />
                    ) : isLoading && skeletonCount > 0 ? (
                        <div className='space-y-1.5'>
                            {Array.from({ length: skeletonCount }).map((_, i) => (
                                <SSHKeySkeleton key={i} />
                            ))}
                        </div>
                    ) : sshKeys?.length === 0 ? (
                        <EmptyState
                            icon={<KeyIcon className='text-primary h-10 w-10' />}
                            title={t('sshKeys.noSshKeysYet')}
                            description={t('sshKeys.noSshKeysDescription')}
                            actionLabel={t('sshKeys.addSshKey')}
                            actionIcon={<PlusCircleIcon className='h-5 w-5' weight='bold' />}
                            onAction={() => setShowCreate(true)}
                        />
                    ) : (
                        <div className='space-y-1.5'>
                            {sshKeys?.map((key) => (
                                <SSHKeyCard key={key.id} sshKey={key} />
                            ))}
                        </div>
                    )}
                </div>

                {showCreate && (
                    <CreateSSHKeyModal onClose={() => setShowCreate(false)} />
                )}
            </main>
        </AppShell>
    )
}

export default SSHKeys