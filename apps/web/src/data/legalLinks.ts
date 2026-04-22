import type { FooterLink } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { ROUTES } from '@/lib'
import { SUPPORT_EMAIL } from '@/lib/links'

const getLegalLinks = (): FooterLink[] => [
    { label: t('footer.blog'), href: ROUTES.BLOG },
    { label: t('footer.privacyPolicy'), href: ROUTES.PRIVACY },
    { label: t('footer.termsOfService'), href: ROUTES.TERMS },
    { label: t('footer.compare'), href: ROUTES.COMPARE },
    // Platform release notes (myclaw.one itself). Kept above the
    // OpenClaw runtime changelog because most users care about
    // "what changed on the website I'm logged into" before "what
    // changed in the runtime on my VPS".
    { label: t('footer.whatsNew'), href: ROUTES.WHATS_NEW },
    { label: t('footer.changelog'), href: ROUTES.CHANGELOG },
    { label: t('footer.getInTouch'), href: `mailto:${SUPPORT_EMAIL}` }
]

export default getLegalLinks