import type { FC, ReactNode } from 'react'

import { motion } from 'framer-motion'
import {
    ArrowSquareOutIcon,
    PencilIcon,
    PlusIcon,
    WrenchIcon
} from '@phosphor-icons/react'
import { PATHS, getBaseDomain } from '@/lib'
import PLATFORM_RELEASES from '@/lib/constants/platformReleases'

import {
    BlogCTA,
    Header,
    LandingFooter,
    PageBackground,
    PageTitle
} from '@/components'

// Platform release notes for myclaw.one itself — separate from
// /changelog (which tracks the OpenClaw runtime version that ships
// onto each provisioned VPS). Strings inline + English-only on
// purpose: release notes are technical, short-lived, and translating
// 14 langs every patch is more cost than benefit.

const TYPE_META: Record<
    string,
    { label: string; icon: typeof PlusIcon; tone: string }
> = {
    added: {
        label: 'Added',
        icon: PlusIcon,
        tone: 'text-emerald-600 dark:text-emerald-400'
    },
    fixed: {
        label: 'Fixed',
        icon: WrenchIcon,
        tone: 'text-blue-600 dark:text-blue-400'
    },
    changed: {
        label: 'Changed',
        icon: PencilIcon,
        tone: 'text-amber-600 dark:text-amber-400'
    }
}

const WhatsNew: FC = (): ReactNode => {
    return (
        <div className='bg-background text-foreground relative flex min-h-screen flex-col'>
            <PageTitle
                title="What's new — myclaw.one"
                description='Release notes for the myclaw.one platform: every version, what shipped, and what was fixed.'
                url={`https://${getBaseDomain()}/${PATHS.WHATS_NEW}`}
            />
            <PageBackground />
            <Header />

            <motion.main
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className='relative mx-auto w-full max-w-4xl flex-1 px-6 py-12'
            >
                <h1 className='font-clash mb-2 text-4xl font-bold'>
                    What&apos;s new
                </h1>
                <p className='text-muted-foreground mb-12'>
                    Every release of the myclaw.one platform — what shipped,
                    what was fixed, what changed.
                </p>

                <div className='relative space-y-8 md:space-y-12'>
                    <div className='from-foreground/20 via-foreground/10 absolute left-[19px] top-6 hidden h-[calc(100%-3rem)] w-px bg-gradient-to-b to-transparent md:block' />

                    {PLATFORM_RELEASES.map((release, index) => (
                        <motion.div
                            key={release.version}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                                duration: 0.4,
                                delay: 0.1 + index * 0.05
                            }}
                            className='cv-auto relative md:pl-14'
                        >
                            <div className='absolute left-0 top-1 hidden md:block'>
                                <div className='border-border bg-foreground/[0.04] flex h-10 w-10 items-center justify-center rounded-full border'>
                                    <div className='bg-foreground/60 h-2 w-2 rounded-full' />
                                </div>
                            </div>

                            <div className='border-border bg-foreground/[0.02] rounded-2xl border p-6 md:p-8'>
                                <div className='mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1'>
                                    <h2 className='font-clash text-2xl font-bold'>
                                        {release.version}
                                    </h2>
                                    <time className='text-muted-foreground text-sm'>
                                        {release.date}
                                    </time>
                                    {release.githubUrl && (
                                        <a
                                            href={release.githubUrl}
                                            target='_blank'
                                            rel='noreferrer'
                                            className='text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 text-xs'
                                        >
                                            GitHub
                                            <ArrowSquareOutIcon
                                                className='h-3 w-3'
                                                weight='bold'
                                            />
                                        </a>
                                    )}
                                </div>

                                <p className='text-foreground mb-5 text-base font-medium leading-relaxed'>
                                    {release.headline}
                                </p>

                                <ul className='space-y-3'>
                                    {release.changes.map((change, i) => {
                                        const meta =
                                            TYPE_META[change.type] ||
                                            TYPE_META.added
                                        const Icon = meta.icon
                                        return (
                                            <li
                                                key={i}
                                                className='flex items-start gap-3'
                                            >
                                                <span
                                                    className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-foreground/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${meta.tone}`}
                                                >
                                                    <Icon
                                                        className='h-3 w-3'
                                                        weight='bold'
                                                    />
                                                    {meta.label}
                                                </span>
                                                <span className='text-foreground text-sm leading-relaxed'>
                                                    {change.text}
                                                </span>
                                            </li>
                                        )
                                    })}
                                </ul>
                            </div>
                        </motion.div>
                    ))}
                </div>

                <p className='text-muted-foreground mt-12 text-center text-xs'>
                    Want every commit?{' '}
                    <a
                        href='https://github.com/microblue/myclaw/releases'
                        target='_blank'
                        rel='noreferrer'
                        className='underline-offset-4 hover:underline'
                    >
                        See the full changelog on GitHub
                    </a>
                    . Looking for the OpenClaw runtime version on each claw?
                    That lives at{' '}
                    <a
                        href={`/${PATHS.CHANGELOG}`}
                        className='underline-offset-4 hover:underline'
                    >
                        /{PATHS.CHANGELOG}
                    </a>
                    .
                </p>

                <BlogCTA />
            </motion.main>

            <LandingFooter />
        </div>
    )
}

export default WhatsNew