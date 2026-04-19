import type { FC, ReactNode } from 'react'

import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
    SparkleIcon,
    BugIcon,
    ArrowLeftIcon,
    DownloadSimpleIcon
} from '@phosphor-icons/react'
import DESKTOP_RELEASES from '@/lib/constants/desktopReleases'
import { PATHS, ROUTES, getBaseDomain } from '@/lib'
import {
    Header,
    LandingFooter,
    PageBackground,
    PageTitle
} from '@/components'

const LATEST = DESKTOP_RELEASES[0]

// Dedicated changelog for the desktop app. Intentionally separate from
// /changelog (which covers the web platform) so users landing from the
// desktop app's "What's new" link aren't buried in platform notes.

const DesktopChangelog: FC = (): ReactNode => {
    return (
        <div className='bg-background text-foreground relative flex min-h-screen flex-col'>
            <PageTitle
                title='Desktop releases'
                description='Version history for the MyClaw.One desktop app — features and bug fixes per release.'
                image={`https://${getBaseDomain()}/changelog-thumbnail.webp`}
                url={`https://${getBaseDomain()}/${PATHS.DESKTOP_CHANGELOG}`}
            />
            <PageBackground />
            <Header />

            <motion.main
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className='relative mx-auto w-full max-w-4xl flex-1 px-6 py-12'
            >
                <Link
                    to={ROUTES.GO}
                    className='text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1 text-sm transition-colors'
                >
                    <ArrowLeftIcon className='h-3.5 w-3.5' />
                    Back to Desktop
                </Link>

                <h1 className='font-clash mb-2 text-4xl font-bold'>
                    Desktop releases
                </h1>
                <p className='text-muted-foreground mb-2'>
                    What changed in each MyClaw.One desktop release.
                </p>
                <p className='text-muted-foreground/70 mb-12 text-xs'>
                    Currently on v{LATEST.version}. Source of truth:{' '}
                    <a
                        href='https://github.com/microblue/myclaw-desktop-releases/releases'
                        target='_blank'
                        rel='noopener noreferrer'
                        className='underline hover:text-foreground'
                    >
                        github.com/microblue/myclaw-desktop-releases
                    </a>
                </p>

                <div className='relative space-y-10'>
                    {/* Vertical timeline rule — hidden on small screens */}
                    <div className='from-foreground/20 via-foreground/10 absolute left-[15px] top-4 hidden h-[calc(100%-2rem)] w-px bg-gradient-to-b to-transparent md:block' />

                    {DESKTOP_RELEASES.map((release, index) => {
                        const isLatest = index === 0
                        return (
                            <motion.article
                                key={release.version}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{
                                    duration: 0.35,
                                    delay: 0.06 * index
                                }}
                                className='cv-auto relative md:pl-12'
                            >
                                <div className='absolute left-0 top-1 hidden md:block'>
                                    {isLatest ? (
                                        <div className='flex h-8 w-8 items-center justify-center rounded-full border border-indigo-500/30 bg-indigo-500/10'>
                                            <div className='h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400' />
                                        </div>
                                    ) : (
                                        <div className='border-border bg-foreground/[0.04] flex h-8 w-8 items-center justify-center rounded-full border'>
                                            <div className='bg-foreground/50 h-1.5 w-1.5 rounded-full' />
                                        </div>
                                    )}
                                </div>

                                <div className='border-border bg-foreground/[0.02] rounded-xl border p-6 md:p-7'>
                                    <div className='mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1'>
                                        <div className='flex items-baseline gap-3'>
                                            <h2 className='font-clash text-2xl font-bold'>
                                                v{release.version}
                                            </h2>
                                            {isLatest && (
                                                <span className='rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-indigo-500 dark:text-indigo-300'>
                                                    Latest
                                                </span>
                                            )}
                                        </div>
                                        <time className='text-muted-foreground text-xs'>
                                            {formatDate(release.date)}
                                        </time>
                                    </div>

                                    <ul className='space-y-3'>
                                        {release.changes.map((change, i) => (
                                            <li
                                                key={i}
                                                className='flex items-start gap-3'
                                            >
                                                {change.kind === 'highlight' ? (
                                                    <SparkleIcon
                                                        className='mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-500 dark:text-indigo-400'
                                                        weight='fill'
                                                    />
                                                ) : (
                                                    <BugIcon
                                                        className='mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400'
                                                        weight='fill'
                                                    />
                                                )}
                                                <span className='text-foreground/90 text-sm leading-relaxed'>
                                                    {change.text}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </motion.article>
                        )
                    })}
                </div>

                <div className='border-border mt-12 rounded-xl border bg-foreground/[0.02] p-6 text-center'>
                    <p className='text-muted-foreground mb-3 text-sm'>
                        Ready to upgrade or install?
                    </p>
                    <Link
                        to={ROUTES.GO}
                        className='inline-flex items-center gap-2 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-500 transition-colors hover:bg-indigo-500/15 dark:text-indigo-300'
                    >
                        <DownloadSimpleIcon
                            className='h-4 w-4'
                            weight='bold'
                        />
                        Get v{LATEST.version}
                    </Link>
                </div>
            </motion.main>

            <LandingFooter />
        </div>
    )
}

const formatDate = (iso: string): string => {
    const d = new Date(iso + 'T00:00:00Z')
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC'
    })
}

export default DesktopChangelog