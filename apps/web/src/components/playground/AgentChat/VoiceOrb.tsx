import type { FC, ReactNode } from 'react'
import type { VoiceOrbProps } from '@/ts/Interfaces'

import { motion } from 'framer-motion'

const VoiceOrb: FC<VoiceOrbProps> = ({ intensity, size = 140 }): ReactNode => {
    const i = Math.min(Math.max(intensity, 0), 1)

    const coreScale = 1 + i * 0.25
    const ring1Scale = 1 + i * 1.2
    const ring2Scale = 1 + i * 1.8
    const ring3Scale = 1 + i * 2.4
    const ring4Scale = 1 + i * 3.0
    const ring1Opacity = 0.08 + i * 0.35
    const ring2Opacity = 0.06 + i * 0.28
    const ring3Opacity = 0.04 + i * 0.2
    const ring4Opacity = 0.03 + i * 0.14
    const glowSpread = 80 + i * 100
    const glowAlpha = 0.4 + i * 0.5
    const logoSize = size * 0.55

    return (
        <div
            className='relative flex items-center justify-center'
            style={{ width: size * 3.5, height: size * 3.5 }}
        >
            <motion.div
                className='absolute rounded-full'
                style={{
                    width: size * 3,
                    height: size * 3,
                    background:
                        'radial-gradient(circle, rgba(239,83,80,0.12) 0%, rgba(198,40,40,0.06) 40%, transparent 70%)',
                    filter: 'blur(40px)'
                }}
                animate={{ scale: ring4Scale, opacity: ring4Opacity }}
                transition={{
                    type: 'spring',
                    stiffness: 80,
                    damping: 6,
                    mass: 1.0
                }}
            />

            <motion.div
                className='absolute rounded-full'
                style={{
                    width: size * 2.4,
                    height: size * 2.4,
                    background:
                        'radial-gradient(circle, rgba(239,83,80,0.2) 0%, rgba(198,40,40,0.1) 40%, transparent 70%)',
                    filter: 'blur(30px)'
                }}
                animate={{ scale: ring3Scale, opacity: ring3Opacity }}
                transition={{
                    type: 'spring',
                    stiffness: 100,
                    damping: 7,
                    mass: 0.8
                }}
            />

            <motion.div
                className='absolute rounded-full'
                style={{
                    width: size * 1.8,
                    height: size * 1.8,
                    background:
                        'radial-gradient(circle, rgba(239,83,80,0.3) 0%, rgba(239,83,80,0.12) 50%, transparent 70%)',
                    filter: 'blur(20px)'
                }}
                animate={{ scale: ring2Scale, opacity: ring2Opacity }}
                transition={{
                    type: 'spring',
                    stiffness: 130,
                    damping: 9,
                    mass: 0.6
                }}
            />

            <motion.div
                className='absolute rounded-full'
                style={{
                    width: size * 1.3,
                    height: size * 1.3,
                    background:
                        'radial-gradient(circle, rgba(239,83,80,0.35) 0%, rgba(239,83,80,0.15) 50%, transparent 70%)',
                    filter: 'blur(12px)'
                }}
                animate={{ scale: ring1Scale, opacity: ring1Opacity }}
                transition={{
                    type: 'spring',
                    stiffness: 180,
                    damping: 11,
                    mass: 0.4
                }}
            />

            <motion.div
                className='relative flex items-center justify-center rounded-full'
                style={{
                    width: size,
                    height: size,
                    background:
                        'radial-gradient(circle at 35% 35%, #ff6f61 0%, #ef5350 40%, #c62828 100%)',
                    boxShadow: `0 0 ${glowSpread}px rgba(239,83,80,${glowAlpha}), 0 0 ${glowSpread * 2}px rgba(198,40,40,${glowAlpha * 0.4}), 0 0 ${glowSpread * 3}px rgba(239,83,80,${glowAlpha * 0.2}), inset 0 -8px 24px rgba(0,0,0,0.2), inset 0 4px 12px rgba(255,255,255,0.15)`
                }}
                animate={{ scale: coreScale }}
                transition={{
                    type: 'spring',
                    stiffness: 300,
                    damping: 15,
                    mass: 0.3
                }}
            >
                <svg
                    viewBox='0 0 120 120'
                    fill='none'
                    xmlns='http://www.w3.org/2000/svg'
                    style={{ width: logoSize, height: logoSize }}
                >
                    <path
                        d='M60 10 C30 10 15 35 15 55 C15 75 30 95 45 100 L45 110 L55 110 L55 100 C55 100 60 102 65 100 L65 110 L75 110 L75 100 C90 95 105 75 105 55 C105 35 90 10 60 10Z'
                        fill='rgba(255,255,255,0.9)'
                    />
                    <path
                        d='M20 45 C5 40 0 50 5 60 C10 70 20 65 25 55 C28 48 25 45 20 45Z'
                        fill='rgba(255,255,255,0.9)'
                    />
                    <path
                        d='M100 45 C115 40 120 50 115 60 C110 70 100 65 95 55 C92 48 95 45 100 45Z'
                        fill='rgba(255,255,255,0.9)'
                    />
                    <path
                        d='M45 15 Q35 5 30 8'
                        stroke='rgba(255,255,255,0.9)'
                        strokeWidth='2'
                        strokeLinecap='round'
                    />
                    <path
                        d='M75 15 Q85 5 90 8'
                        stroke='rgba(255,255,255,0.9)'
                        strokeWidth='2'
                        strokeLinecap='round'
                    />
                    <circle cx='45' cy='35' r='6' fill='rgba(198,40,40,0.8)' />
                    <circle cx='75' cy='35' r='6' fill='rgba(198,40,40,0.8)' />
                    <circle cx='46' cy='34' r='2' fill='#ffffff' />
                    <circle cx='76' cy='34' r='2' fill='#ffffff' />
                </svg>
            </motion.div>
        </div>
    )
}

export default VoiceOrb