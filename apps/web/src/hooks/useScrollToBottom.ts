import type { UseScrollToBottomOptions } from '@/ts/Interfaces'

import { useRef, useState, useCallback } from 'react'

const useScrollToBottom = (options?: UseScrollToBottomOptions) => {
    const scrollRef = useRef<HTMLDivElement>(null)
    const isAtBottomRef = useRef(true)
    const [showButton, setShowButton] = useState(false)

    const threshold = options?.threshold ?? 100

    const handleScroll = useCallback(() => {
        const el = scrollRef.current
        if (!el) return
        const atBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight < threshold
        isAtBottomRef.current = atBottom
        setShowButton(!atBottom)
    }, [threshold])

    const scrollToBottom = useCallback(
        (behavior: ScrollBehavior = 'smooth') => {
            if (scrollRef.current) {
                scrollRef.current.scrollTo({
                    top: scrollRef.current.scrollHeight,
                    behavior
                })
                setShowButton(false)
                isAtBottomRef.current = true
            }
        },
        []
    )

    return {
        scrollRef,
        showButton,
        setShowButton,
        handleScroll,
        scrollToBottom,
        isAtBottomRef
    }
}

export default useScrollToBottom