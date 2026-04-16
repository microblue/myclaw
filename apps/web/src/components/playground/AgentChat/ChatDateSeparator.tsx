import type { FC, ReactNode } from 'react'
import type { ChatDateSeparatorProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { getLocale } from '@/lib'

const ChatDateSeparator: FC<ChatDateSeparatorProps> = ({ date }): ReactNode => {
    const messageDate = new Date(date)
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    const isSameDay = (a: Date, b: Date): boolean =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()

    let label: string
    if (isSameDay(messageDate, today)) {
        label = t('playground.chatToday')
    } else if (isSameDay(messageDate, yesterday)) {
        label = t('playground.chatYesterday')
    } else {
        label = messageDate.toLocaleDateString(getLocale(), {
            month: 'short',
            day: 'numeric'
        })
    }

    return (
        <div className='flex items-center gap-3 py-2'>
            <div className='bg-border h-px flex-1' />
            <span className='text-muted-foreground text-[11px] font-medium'>
                {label}
            </span>
            <div className='bg-border h-px flex-1' />
        </div>
    )
}

export default ChatDateSeparator