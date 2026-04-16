import type { FC, ReactNode } from 'react'

import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { Button } from '@/components/ui'
import { Header, LandingFooter, PageBackground, PageTitle } from '@/components'
import { ROUTES } from '@/lib'
import { HouseIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'

const NotFound: FC = (): ReactNode => {
    return (
        <div className='bg-background text-foreground relative flex min-h-screen flex-col'>
            <PageTitle
                title={t('common.pageNotFound')}
                description={t('errors.pageNotFoundDescription')}
                noIndex
            />
            <PageBackground />
            <Header />

            <motion.main
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className='relative flex flex-1 items-center justify-center px-6 py-32 pb-48'
            >
                <div className='max-w-md text-center'>
                    <div className='from-primary/20 to-primary/5 mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br'>
                        <MagnifyingGlassIcon className='text-primary h-12 w-12' />
                    </div>

                    <h1 className='font-clash mb-4 text-6xl font-bold'>404</h1>
                    <h2 className='mb-2 text-xl font-semibold'>
                        {t('errors.notFound')}
                    </h2>
                    <p className='text-muted-foreground mb-8'>
                        {t('errors.pageNotFoundDescription')}
                    </p>

                    <Button size='lg' asChild>
                        <Link to={ROUTES.HOME}>
                            <HouseIcon className='h-5 w-5' weight='regular' />
                            {t('errors.goToHomepage')}
                        </Link>
                    </Button>
                </div>
            </motion.main>

            <LandingFooter />
        </div>
    )
}

export default NotFound