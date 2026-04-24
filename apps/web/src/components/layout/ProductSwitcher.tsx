import type { FC, ReactNode } from 'react'

import { Link } from 'react-router-dom'
import { t } from '@openclaw/i18n'
import { ROUTES } from '@/lib'

const DESKTOP_SITE_URL = 'https://desktop.myclaw.one'

const ProductSwitcher: FC = (): ReactNode => {
    return (
        <div className='bg-foreground/5 border-border flex items-center gap-0.5 rounded-lg border p-0.5'>
            <Link
                to={ROUTES.HOME}
                className='bg-foreground text-background rounded-md px-3 py-1 text-xs font-medium shadow-sm transition'
            >
                {t('nav.cloud')}
            </Link>
            <a
                href={DESKTOP_SITE_URL}
                className='text-muted-foreground hover:text-foreground rounded-md px-3 py-1 text-xs font-medium transition'
            >
                {t('nav.desktop')}
            </a>
        </div>
    )
}

export default ProductSwitcher
