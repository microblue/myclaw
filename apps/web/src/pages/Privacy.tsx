import type { FC, ReactNode } from 'react'

import { motion } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { LEGAL_EMAIL } from '@/lib/links'
import { PATHS, getBaseDomain } from '@/lib'

import {
    BlogCTA,
    Header,
    LandingFooter,
    PageBackground,
    PageTitle
} from '@/components'

const Privacy: FC = (): ReactNode => {
    return (
        <div className='bg-background text-foreground relative flex min-h-screen flex-col'>
            <PageTitle
                title={t('privacy.title')}
                description={t('privacy.description')}
                image={`https://${getBaseDomain()}/privacy-policy-thumbnail.webp`}
                url={`https://${getBaseDomain()}/${PATHS.PRIVACY}`}
            />
            <PageBackground />
            <Header />

            <motion.main
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className='relative mx-auto w-full max-w-6xl flex-1 px-6 py-12'
            >
                <h1 className='font-clash mb-2 text-4xl font-bold'>
                    {t('privacy.title')}
                </h1>
                <p className='text-muted-foreground mb-12'>
                    {t('privacy.lastUpdated')}
                </p>

                <div className='prose dark:prose-invert prose-sm max-w-none space-y-8'>
                    <section>
                        <h2 className='mb-3 text-xl font-semibold'>
                            {t('privacy.introTitle')}
                        </h2>
                        <p className='text-muted-foreground leading-relaxed'>
                            {t('privacy.introText')}
                        </p>
                    </section>

                    <section>
                        <h2 className='mb-3 text-xl font-semibold'>
                            {t('privacy.authTitle')}
                        </h2>
                        <p className='text-muted-foreground leading-relaxed'>
                            {t('privacy.authText')}
                        </p>
                    </section>

                    <section>
                        <h2 className='mb-3 text-xl font-semibold'>
                            {t('privacy.collectTitle')}
                        </h2>
                        <p className='text-muted-foreground mb-3 leading-relaxed'>
                            {t('privacy.collectText')}
                        </p>

                        <h3 className='mb-2 text-lg font-medium'>
                            {t('privacy.personalInfoTitle')}
                        </h3>
                        <ul className='text-muted-foreground list-inside list-disc space-y-2'>
                            <li>{t('privacy.personalInfoEmail')}</li>
                            <li>{t('privacy.personalInfoName')}</li>
                            <li>{t('privacy.personalInfoPayment')}</li>
                        </ul>

                        <h3 className='mb-2 mt-4 text-lg font-medium'>
                            {t('privacy.serverInfoTitle')}
                        </h3>
                        <ul className='text-muted-foreground list-inside list-disc space-y-2'>
                            <li>{t('privacy.serverInfoConfig')}</li>
                            <li>{t('privacy.serverInfoIp')}</li>
                            <li>{t('privacy.serverInfoResources')}</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className='mb-3 text-xl font-semibold'>
                            {t('privacy.useTitle')}
                        </h2>
                        <p className='text-muted-foreground leading-relaxed'>
                            {t('privacy.useText')}
                        </p>
                        <ul className='text-muted-foreground mt-2 list-inside list-disc space-y-2'>
                            <li>{t('privacy.useProvide')}</li>
                            <li>{t('privacy.useTransactions')}</li>
                            <li>{t('privacy.useNotices')}</li>
                            <li>{t('privacy.useSupport')}</li>
                            <li>{t('privacy.useAnalyze')}</li>
                            <li>{t('privacy.useFraud')}</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className='mb-3 text-xl font-semibold'>
                            {t('privacy.sharingTitle')}
                        </h2>
                        <p className='text-muted-foreground leading-relaxed'>
                            {t('privacy.sharingText')}
                        </p>
                        <ul className='text-muted-foreground mt-2 list-inside list-disc space-y-2'>
                            <li>{t('privacy.sharingProviders')}</li>
                            <li>{t('privacy.sharingLegal')}</li>
                            <li>{t('privacy.sharingBusiness')}</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className='mb-3 text-xl font-semibold'>
                            {t('privacy.securityTitle')}
                        </h2>
                        <p className='text-muted-foreground leading-relaxed'>
                            {t('privacy.securityText')}
                        </p>
                    </section>

                    <section>
                        <h2 className='mb-3 text-xl font-semibold'>
                            {t('privacy.retentionTitle')}
                        </h2>
                        <p className='text-muted-foreground leading-relaxed'>
                            {t('privacy.retentionText')}
                        </p>
                    </section>

                    <section>
                        <h2 className='mb-3 text-xl font-semibold'>
                            {t('privacy.rightsTitle')}
                        </h2>
                        <p className='text-muted-foreground leading-relaxed'>
                            {t('privacy.rightsText')}
                        </p>
                        <ul className='text-muted-foreground mt-2 list-inside list-disc space-y-2'>
                            <li>{t('privacy.rightsAccess')}</li>
                            <li>{t('privacy.rightsCorrect')}</li>
                            <li>{t('privacy.rightsDelete')}</li>
                            <li>{t('privacy.rightsObject')}</li>
                            <li>{t('privacy.rightsPortability')}</li>
                            <li>{t('privacy.rightsWithdraw')}</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className='mb-3 text-xl font-semibold'>
                            {t('privacy.cookiesTitle')}
                        </h2>
                        <p className='text-muted-foreground leading-relaxed'>
                            {t('privacy.cookiesText')}
                        </p>
                    </section>

                    <section>
                        <h2 className='mb-3 text-xl font-semibold'>
                            {t('privacy.transfersTitle')}
                        </h2>
                        <p className='text-muted-foreground leading-relaxed'>
                            {t('privacy.transfersText')}
                        </p>
                    </section>

                    <section>
                        <h2 className='mb-3 text-xl font-semibold'>
                            {t('privacy.eligibilityTitle')}
                        </h2>
                        <p className='text-muted-foreground leading-relaxed'>
                            {t('privacy.eligibilityText')}
                        </p>
                    </section>

                    <section>
                        <h2 className='mb-3 text-xl font-semibold'>
                            {t('privacy.changesTitle')}
                        </h2>
                        <p className='text-muted-foreground leading-relaxed'>
                            {t('privacy.changesText')}
                        </p>
                    </section>

                    <section>
                        <h2 className='mb-3 text-xl font-semibold'>
                            {t('privacy.contactTitle')}
                        </h2>
                        <p className='text-muted-foreground leading-relaxed'>
                            {t('privacy.contactText')}{' '}
                            <a
                                href={LEGAL_EMAIL}
                                className='text-primary hover:underline'
                            >
                                {t('common.legalEmail')}
                            </a>
                        </p>
                    </section>
                </div>

                <BlogCTA />
            </motion.main>

            <LandingFooter />
        </div>
    )
}

export default Privacy