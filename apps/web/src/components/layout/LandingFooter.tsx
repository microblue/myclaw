import type { FC, MouseEvent, ReactNode } from 'react'

import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { t } from '@openclaw/i18n'
import Logo from '@/components/layout/Logo'
import { ROUTES } from '@/lib'

const LANDING_SECTIONS = ['features', 'pricing', 'comparison', 'faq']

const LandingFooter: FC = (): ReactNode => {
    const { pathname } = useLocation()
    const isLanding = pathname === ROUTES.HOME
    const [activeSection, setActiveSection] = useState('')

    useEffect(() => {
        if (!isLanding) return

        const handleScroll = (): void => {
            for (const section of [...LANDING_SECTIONS].reverse()) {
                const el = document.getElementById(section)
                if (el && window.scrollY >= el.offsetTop - 100) {
                    setActiveSection(section)
                    return
                }
            }
            if (window.scrollY < 200) setActiveSection('')
        }

        window.addEventListener('scroll', handleScroll)
        handleScroll()
        return () => window.removeEventListener('scroll', handleScroll)
    }, [isLanding])

    const hashClass = (section: string): string =>
        `transition ${isLanding && activeSection === section ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`

    const handleHashClick = (e: MouseEvent, section: string): void => {
        if (isLanding) {
            e.preventDefault()
            const el = document.getElementById(section)
            if (el) el.scrollIntoView({ behavior: 'smooth' })
        }
    }

    return (
        <footer className='border-border border-t px-6 py-16'>
            <div className='mx-auto max-w-6xl'>
                <div className='grid gap-12 md:grid-cols-4'>
                    <div className='md:col-span-2'>
                        <Logo />
                        <p className='text-muted-foreground mt-4 max-w-sm text-[15.5px]'>
                            {t('footer.productDescription')}
                        </p>
                        <div className='mt-5 hidden items-center gap-3'>
                            <a
                                href='#'
                                target='_blank'
                                rel='noopener noreferrer'
                                aria-label={t('footer.downloadAndroid')}
                                className='opacity-80 transition hover:opacity-100'
                            >
                                <img
                                    src='/badges/google-play-dark.svg'
                                    alt={t('footer.downloadAndroid')}
                                    loading='lazy'
                                    className='hidden h-10 dark:block'
                                />
                                <img
                                    src='/badges/google-play-light.svg'
                                    alt={t('footer.downloadAndroid')}
                                    loading='lazy'
                                    className='block h-10 dark:hidden'
                                />
                            </a>
                            <a
                                href='#'
                                target='_blank'
                                rel='noopener noreferrer'
                                aria-label={t('footer.downloadIos')}
                                className='opacity-80 transition hover:opacity-100'
                            >
                                <img
                                    src='/badges/app-store-light.svg'
                                    alt={t('footer.downloadIos')}
                                    loading='lazy'
                                    className='block h-10 dark:hidden'
                                />
                                <img
                                    src='/badges/app-store-dark.svg'
                                    alt={t('footer.downloadIos')}
                                    loading='lazy'
                                    className='hidden h-10 dark:block'
                                />
                            </a>
                        </div>
                        <p className='text-muted-foreground mt-4 text-sm'>
                            &copy; {new Date().getFullYear()}{' '}
                            {t('footer.copyrightName')}{' '}
                            <span className='text-muted-foreground/60 text-[11px]'>
                                ({__APP_VERSION__})
                            </span>
                            . {t('footer.copyrightRights')}
                        </p>
                    </div>

                    <nav aria-label={t('footer.product')}>
                        <h4 className='font-clash text-foreground mb-4 font-semibold'>
                            {t('footer.product')}
                        </h4>
                        <ul className='space-y-3 text-sm'>
                            <li>
                                <Link
                                    to={`${ROUTES.HOME}#features`}
                                    onClick={(e) =>
                                        handleHashClick(e, 'features')
                                    }
                                    className={hashClass('features')}
                                >
                                    {t('landing.features')}
                                </Link>
                            </li>
                            <li>
                                <Link
                                    to={`${ROUTES.HOME}#pricing`}
                                    onClick={(e) =>
                                        handleHashClick(e, 'pricing')
                                    }
                                    className={hashClass('pricing')}
                                >
                                    {t('landing.pricing')}
                                </Link>
                            </li>
                            <li>
                                <Link
                                    to={`${ROUTES.HOME}#comparison`}
                                    onClick={(e) =>
                                        handleHashClick(e, 'comparison')
                                    }
                                    className={hashClass('comparison')}
                                >
                                    {t('landing.comparison')}
                                </Link>
                            </li>
                            <li>
                                <Link
                                    to={`${ROUTES.HOME}#faq`}
                                    onClick={(e) => handleHashClick(e, 'faq')}
                                    className={hashClass('faq')}
                                >
                                    {t('landing.faqTitle')}
                                </Link>
                            </li>
                        </ul>
                    </nav>


                </div>
            </div>
        </footer>
    )
}

export default LandingFooter