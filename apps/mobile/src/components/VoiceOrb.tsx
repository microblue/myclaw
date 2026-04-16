import type { FC, ReactNode } from 'react'
import type { VoiceOrbProps } from '@/ts/Interfaces'

import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { COLORS } from '@/lib/theme'

const VoiceOrb: FC<VoiceOrbProps> = ({ intensity, size = 160 }): ReactNode => {
    const coreScale = useRef(new Animated.Value(1)).current
    const ring1Scale = useRef(new Animated.Value(1)).current
    const ring2Scale = useRef(new Animated.Value(1)).current
    const ring1Opacity = useRef(new Animated.Value(0.04)).current
    const ring2Opacity = useRef(new Animated.Value(0.02)).current

    useEffect(() => {
        const i = Math.min(Math.max(intensity, 0), 1)
        Animated.parallel([
            Animated.timing(coreScale, {
                toValue: 1 + i * 0.15,
                duration: 100,
                useNativeDriver: true
            }),
            Animated.timing(ring1Scale, {
                toValue: 1 + i * 0.4,
                duration: 100,
                useNativeDriver: true
            }),
            Animated.timing(ring2Scale, {
                toValue: 1 + i * 0.6,
                duration: 100,
                useNativeDriver: true
            }),
            Animated.timing(ring1Opacity, {
                toValue: 0.04 + i * 0.12,
                duration: 100,
                useNativeDriver: true
            }),
            Animated.timing(ring2Opacity, {
                toValue: 0.02 + i * 0.08,
                duration: 100,
                useNativeDriver: true
            })
        ]).start()
    }, [
        intensity,
        coreScale,
        ring1Scale,
        ring2Scale,
        ring1Opacity,
        ring2Opacity
    ])

    const glowSize = size * 2

    return (
        <View style={[styles.container, { width: glowSize, height: glowSize }]}>
            <Animated.View
                style={[
                    styles.glow,
                    {
                        width: glowSize,
                        height: glowSize,
                        borderRadius: glowSize / 2,
                        transform: [{ scale: ring2Scale }],
                        opacity: ring2Opacity
                    }
                ]}
            />
            <Animated.View
                style={[
                    styles.glow,
                    {
                        width: size * 1.5,
                        height: size * 1.5,
                        borderRadius: size * 0.75,
                        transform: [{ scale: ring1Scale }],
                        opacity: ring1Opacity
                    }
                ]}
            />
            <Animated.View
                style={[
                    styles.core,
                    {
                        width: size,
                        height: size,
                        borderRadius: size / 2,
                        transform: [{ scale: coreScale }]
                    }
                ]}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center'
    },
    glow: {
        position: 'absolute',
        backgroundColor: COLORS.accent
    },
    core: {
        backgroundColor: COLORS.white,
        shadowColor: COLORS.accent,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 40,
        elevation: 20
    }
})

export default VoiceOrb