import type { FC, ReactNode } from 'react'
import type { ChatEmptyStateProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { ChatTeardropTextIcon, WifiSlashIcon } from '@phosphor-icons/react'

const ChatEmptyState: FC<ChatEmptyStateProps> = ({ isError }): ReactNode => {
    if (isError) {
        return (
            <div className='flex h-full flex-col items-center justify-center gap-3 px-14 pb-16'>
                <div className='bg-foreground/5 flex h-12 w-12 items-center justify-center rounded-xl'>
                    <WifiSlashIcon
                        className='text-muted-foreground h-6 w-6'
                        weight='duotone'
                    />
                </div>
                <div className='text-center'>
                    <p className='text-foreground/80 text-sm font-medium'>
                        {t('playground.chatConnectionFailed')}
                    </p>
                    <p className='text-muted-foreground mt-1 text-xs'>
                        {t('playground.chatConnectionFailedDescription')}
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className='flex h-full flex-col items-center justify-center gap-3 px-14 pb-16'>
            <div className='bg-foreground/5 flex h-12 w-12 items-center justify-center rounded-xl'>
                <ChatTeardropTextIcon
                    className='text-muted-foreground h-6 w-6'
                    weight='duotone'
                />
            </div>
            <div className='text-center'>
                <p className='text-foreground/80 text-sm font-medium'>
                    {t('playground.chatNoMessages')}
                </p>
                <p className='text-muted-foreground mt-1 text-xs'>
                    {t('playground.chatNoMessagesDescription')}
                </p>
            </div>
        </div>
    )
}

export default ChatEmptyState