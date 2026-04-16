import type { FC, ReactNode } from 'react'

const ChatSkeleton: FC = (): ReactNode => {
    return (
        <div className='flex h-full flex-col gap-3 p-4'>
            <div className='flex justify-end'>
                <div className='bg-foreground/5 h-10 w-48 animate-pulse rounded-2xl rounded-br-md' />
            </div>
            <div className='flex justify-start'>
                <div className='bg-foreground/[0.03] h-16 w-64 animate-pulse rounded-2xl rounded-bl-md' />
            </div>
            <div className='flex justify-end'>
                <div className='bg-foreground/5 h-10 w-36 animate-pulse rounded-2xl rounded-br-md' />
            </div>
            <div className='flex justify-start'>
                <div className='bg-foreground/[0.03] h-24 w-72 animate-pulse rounded-2xl rounded-bl-md' />
            </div>
            <div className='flex justify-end'>
                <div className='bg-foreground/5 h-10 w-52 animate-pulse rounded-2xl rounded-br-md' />
            </div>
        </div>
    )
}

export default ChatSkeleton