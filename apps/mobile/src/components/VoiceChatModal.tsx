import type { FC, ReactNode } from 'react'
import type { VoiceChatModalProps } from '@/ts/Interfaces'

import { useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X, Waveform } from 'phosphor-react-native'
import { t } from '@openclaw/i18n'
import { COLORS } from '@/lib/theme'
import VoiceOrb from '@/components/VoiceOrb'

const VoiceChatModal: FC<VoiceChatModalProps> = ({
    visible,
    clawName,
    onClose
}): ReactNode => {
    const insets = useSafeAreaInsets()
    const [isListening, setIsListening] = useState(false)
    const [intensity] = useState(0)

    const handleToggle = (): void => {
        setIsListening(!isListening)
    }

    const handleClose = (): void => {
        setIsListening(false)
        onClose()
    }

    return (
        <Modal
            visible={visible}
            animationType='slide'
            presentationStyle='fullScreen'
            statusBarTranslucent
        >
            <View style={[styles.container, { paddingTop: insets.top }]}>
                <View style={styles.header}>
                    <View style={styles.headerCenter}>
                        <Waveform
                            size={16}
                            color={COLORS.accent}
                            weight='fill'
                        />
                        <Text style={styles.headerTitle}>
                            {t('mobile.voiceMode')}
                        </Text>
                    </View>
                    <Text style={styles.headerSubtitle} numberOfLines={1}>
                        {clawName}
                    </Text>
                </View>

                <Pressable style={styles.orbContainer} onPress={handleToggle}>
                    <VoiceOrb intensity={intensity} size={140} />
                </Pressable>

                <Text style={styles.statusText}>
                    {isListening
                        ? t('mobile.voiceListening')
                        : t('mobile.voiceTapToSpeak')}
                </Text>

                <View
                    style={[
                        styles.footer,
                        { paddingBottom: insets.bottom + 16 }
                    ]}
                >
                    <Pressable style={styles.closeButton} onPress={handleClose}>
                        <X size={24} color={COLORS.white} weight='bold' />
                    </Pressable>
                </View>
            </View>
        </Modal>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background
    },
    header: {
        alignItems: 'center',
        paddingTop: 20,
        paddingHorizontal: 24
    },
    headerCenter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6
    },
    headerTitle: {
        fontSize: 15,
        fontFamily: 'ClashDisplay-Semibold',
        color: COLORS.text
    },
    headerSubtitle: {
        fontSize: 13,
        fontFamily: 'Satoshi-Regular',
        color: COLORS.textMuted,
        marginTop: 4
    },
    orbContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center'
    },
    statusText: {
        textAlign: 'center',
        fontSize: 14,
        fontFamily: 'Satoshi-Medium',
        color: COLORS.textMuted,
        marginBottom: 32
    },
    footer: {
        alignItems: 'center',
        paddingHorizontal: 24
    },
    closeButton: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center'
    }
})

export default VoiceChatModal