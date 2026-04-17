import type { FC, ReactNode } from 'react'
import type { HeroTitleProps } from '@/ts/Interfaces'

import { Fragment } from 'react'

const HeroTitle: FC<HeroTitleProps> = ({
    line1,
    line2,
    description
}): ReactNode => {
    return (
        <Fragment>
            <h1 className='font-clash mb-6 text-4xl font-bold leading-[1.08] tracking-tight md:text-6xl lg:text-7xl'>
                <span className='from-foreground via-foreground to-muted-foreground bg-gradient-to-b bg-clip-text text-transparent'>
                    {line1}
                </span>
                <br />
                <span className='animate-gradient bg-gradient-to-r from-[#6366f1] via-[#818cf8] to-[#a5b4fc] bg-clip-text text-transparent'>
                    {line2}
                </span>
            </h1>

            <p className='text-muted-foreground mb-10 max-w-2xl text-base leading-relaxed md:text-lg'>
                {description}
            </p>
        </Fragment>
    )
}

export default HeroTitle