import type { FC, ReactNode } from 'react'

import { DownloadSimpleIcon } from '@phosphor-icons/react'
import { t } from '@openclaw/i18n'

const DOWNLOAD_VERSION = '1.4.0'
const BASE_URL = `https://github.com/microblue/myclaw-desktop-releases/releases/download/v${DOWNLOAD_VERSION}`

const WindowsIcon = () => (
    <svg viewBox='0 0 24 24' className='h-5 w-5' fill='currentColor'>
        <path d='M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801' />
    </svg>
)

const LinuxIcon = () => (
    <svg viewBox='0 0 24 24' className='h-5 w-5' fill='currentColor'>
        <path d='M12.504 0c-.155 0-.315.008-.481.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.04.001c-.17.35-.247.783-.226 1.229.021.47.112.962.303 1.479.402 1.094 1.218 2.227 2.462 2.799.464 1.415 1.485 2.299 2.686 2.299.85 0 1.64-.406 2.246-1.084.94.15 1.985.044 3.015-.287 1.049.293 2.046.424 2.94.305.873.975 1.918 1.066 2.789 1.066 1.162 0 2.17-.843 2.64-2.188.98-.438 1.763-1.355 2.183-2.449.453-1.178.44-2.516-.18-3.631.055-.188.08-.381.046-.575l-.007-.036c.126-.787-.014-1.638-.3-2.479-.59-1.77-1.83-3.469-2.714-4.519-.756-1.067-.975-1.928-1.05-3.02-.066-1.49 1.055-5.965-3.17-6.298-.166-.014-.326-.02-.48-.02z' />
    </svg>
)

interface DownloadItem {
    icon: ReactNode
    label: string
    sublabel: string
    url: string
    featured?: boolean
}

const downloads: DownloadItem[] = [
    {
        icon: <WindowsIcon />,
        label: 'Windows',
        sublabel: 'x64 · .exe Installer',
        url: `${BASE_URL}/MyClaw.One-${DOWNLOAD_VERSION}-win-x64.exe`,
        featured: true
    },
    {
        icon: <LinuxIcon />,
        label: 'Linux',
        sublabel: 'x64 · AppImage',
        url: `${BASE_URL}/MyClaw.One-${DOWNLOAD_VERSION}-linux-x86_64.AppImage`
    },
    {
        icon: <LinuxIcon />,
        label: 'Linux',
        sublabel: 'x64 · Debian / Ubuntu',
        url: `${BASE_URL}/MyClaw.One-${DOWNLOAD_VERSION}-linux-amd64.deb`
    },
    {
        icon: <LinuxIcon />,
        label: 'Linux',
        sublabel: 'x64 · RPM',
        url: `${BASE_URL}/MyClaw.One-${DOWNLOAD_VERSION}-linux-x86_64.rpm`
    },
    {
        icon: <LinuxIcon />,
        label: 'Linux ARM64',
        sublabel: 'arm64 · AppImage',
        url: `${BASE_URL}/MyClaw.One-${DOWNLOAD_VERSION}-linux-arm64.AppImage`
    },
    {
        icon: <LinuxIcon />,
        label: 'Linux ARM64',
        sublabel: 'arm64 · Debian / Ubuntu',
        url: `${BASE_URL}/MyClaw.One-${DOWNLOAD_VERSION}-linux-arm64.deb`
    }
]

const GoDownloadButtons: FC = (): ReactNode => {
    return (
        <div className='flex w-full flex-col items-center gap-4'>
            {/* Download grid — uniform card style */}
            <div className='grid w-full max-w-xl grid-cols-2 gap-2.5 sm:grid-cols-3'>
                {downloads.map((dl) => (
                    <a
                        key={dl.url}
                        href={dl.url}
                        download
                        className={`group flex flex-col items-start gap-2.5 rounded-xl border p-3.5 transition-all duration-150 ${
                            dl.featured
                                ? 'border-indigo-500/40 bg-indigo-500/10 hover:border-indigo-400/60 hover:bg-indigo-500/15'
                                : 'border-white/8 bg-white/[0.04] hover:border-white/15 hover:bg-white/[0.07]'
                        }`}
                    >
                        <div
                            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                                dl.featured
                                    ? 'bg-indigo-500/20 text-indigo-300'
                                    : 'bg-white/8 text-white/50'
                            }`}
                        >
                            {dl.icon}
                        </div>
                        <div className='flex w-full items-end justify-between gap-1'>
                            <div>
                                <div
                                    className={`text-sm font-semibold leading-tight ${dl.featured ? 'text-white' : 'text-white/80'}`}
                                >
                                    {dl.label}
                                </div>
                                <div className='mt-0.5 text-xs leading-tight text-white/40'>
                                    {dl.sublabel}
                                </div>
                            </div>
                            <DownloadSimpleIcon
                                className={`mb-0.5 h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-y-0.5 ${dl.featured ? 'text-indigo-400' : 'text-white/30'}`}
                            />
                        </div>
                    </a>
                ))}
            </div>

            {/* Version + releases link */}
            <p className='text-muted-foreground text-xs'>
                {t('go.currentVersion', { version: DOWNLOAD_VERSION })} ·{' '}
                <a
                    href='https://github.com/microblue/myclaw-desktop-releases/releases'
                    target='_blank'
                    rel='noopener noreferrer'
                    className='hover:text-foreground underline underline-offset-2 transition-colors'
                >
                    {t('go.allReleases')}
                </a>
            </p>
        </div>
    )
}

export default GoDownloadButtons