import type { FC, ReactNode } from 'react'
import type { ChatSpeechButtonProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import {
    SpeakerHighIcon,
    ArrowCounterClockwiseIcon,
    XIcon,
    CircleNotchIcon
} from '@phosphor-icons/react'

const ChatSpeechButton: FC<ChatSpeechButtonProps> = ({
    messageId,
    text,
    isSpeaking,
    isLoading,
    onSpeak,
    onStop
}): ReactNode => {
    if (isLoading) {
        return (
            <span className='text-muted-foreground'>
                <CircleNotchIcon
                    className='h-3 w-3 animate-spin'
                    weight='bold'
                />
            </span>
        )
    }

    if (isSpeaking) {
        return (
            <div className='flex items-center gap-1'>
                <button
                    onClick={() => onSpeak(messageId, text)}
                    title={t('playground.chatReplaySpeech')}
                    className='text-muted-foreground hover:text-foreground transition-colors'
                >
                    <ArrowCounterClockwiseIcon
                        className='h-3 w-3'
                        weight='bold'
                    />
                </button>
                <button
                    onClick={() => onStop()}
                    title={t('playground.chatStopSpeech')}
                    className='text-muted-foreground hover:text-foreground transition-colors'
                >
                    <XIcon className='h-3 w-3' weight='bold' />
                </button>
            </div>
        )
    }

    return (
        <button
            onClick={() => onSpeak(messageId, text)}
            title={t('playground.chatPlaySpeech')}
            className='text-muted-foreground hover:text-foreground transition-colors'
        >
            <SpeakerHighIcon className='h-3 w-3' weight='bold' />
        </button>
    )
}

export default ChatSpeechButton