import type { FC, ReactNode } from 'react'
import type { HeroButtonsProps } from '@/ts/Interfaces'

import { Link } from 'react-router-dom'
import { Button } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { ROUTES } from '@/lib'
import { SparkleIcon } from '@phosphor-icons/react'

// The Hero CTA goes straight to the AI OS setup flow. Logged-in
// users land on /aios/install (the redeem screen — they can paste
// an activation code or pick a fresh setup). Logged-out users hit
// /login with `next=/aios/install` so the redirect after sign-in
// drops them back into the same flow rather than the generic /aios
// list. Previously the button pointed at `/claws?deploy=true`, but
// the role-routed /claws redirect now drops the query string before
// the Dashboard's `?deploy=true` handler runs, so the click was a
// dead end on every role.
const HeroButtons: FC<HeroButtonsProps> = ({
    deployLabel,
    large
}): ReactNode => {
    const { user } = useAuth()

    return (
        <Button
            size='lg'
            className={`gap-2 border-0 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] font-semibold text-white hover:opacity-90 ${large ? 'px-8 py-6 text-lg' : 'px-6'}`}
            asChild
        >
            <Link
                to={
                    user
                        ? ROUTES.AIOS_INSTALL
                        : `${ROUTES.LOGIN}?next=${encodeURIComponent(ROUTES.AIOS_INSTALL)}`
                }
            >
                <SparkleIcon className='h-5 w-5' weight='fill' />
                {deployLabel}
            </Link>
        </Button>
    )
}

export default HeroButtons