import type { FC, ReactNode } from 'react'
import type { ClawLogsContentProps, ParsedLogLine } from '@/ts/Interfaces'

import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from '@openclaw/i18n'
import { getLocale, Envs } from '@/lib'
import { getCachedToken } from '@/lib/firebase'
import { Skeleton } from '@/components/ui'
import { ScrollIcon } from '@phosphor-icons/react'
import { useScrollToBottom } from '@/hooks'
import { PanelPlaceholder, ScrollToBottomButton } from '@/components/shared'

// Strips ANSI CSI + OSC sequences so colored output from certbot / npm
// / apt (which the VPS-side `tail -F` forwards verbatim from the
// bootstrap log) doesn't render as gibberish. Terminal rendering lives
// in the SSH tab; this component is a web log viewer, not a pty.
const ANSI_REGEX =
    // eslint-disable-next-line no-control-regex
    /\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07/g

const MAX_LINES = 2000
const TIMESTAMP_REGEX = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\s*/

const parseLine = (raw: string): ParsedLogLine => {
    const clean = raw.replace(ANSI_REGEX, '')
    const match = clean.match(TIMESTAMP_REGEX)
    if (match) {
        const date = new Date(match[1])
        const time = date.toLocaleTimeString(getLocale(), {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        })
        return { time, text: clean.slice(match[0].length) }
    }
    return { time: null, text: clean }
}

const ClawLogsContent: FC<ClawLogsContentProps> = ({
    clawId,
    enabled,
    embedded,
    mockLogs,
    source
}): ReactNode => {
    const [lines, setLines] = useState<ParsedLogLine[]>(() =>
        mockLogs
            ? mockLogs
                  .split('\n')
                  .filter((l) => l.trim())
                  .map(parseLine)
            : []
    )
    const [status, setStatus] = useState<'pending' | 'streaming' | 'error'>(
        mockLogs ? 'streaming' : 'pending'
    )
    const pendingFragmentRef = useRef('')
    const {
        scrollRef,
        showButton,
        handleScroll,
        scrollToBottom,
        isAtBottomRef
    } = useScrollToBottom({ threshold: 50 })
    const isFirstLoadRef = useRef(true)

    // Subscribes to the control-plane's terminal WS in read-only tail
    // mode (`?stream=bootstrap|gateway`) and feeds incoming chunks
    // through the line parser. Re-runs when `source` flips, tearing
    // down the old WS so the viewer always reflects exactly one log.
    useEffect(() => {
        if (!enabled || mockLogs) return
        let cancelled = false
        let ws: WebSocket | null = null

        setLines([])
        pendingFragmentRef.current = ''
        setStatus('pending')

        const connect = async () => {
            const token = await getCachedToken()
            if (cancelled) return
            if (!token) {
                setStatus('error')
                return
            }

            const apiUrl = Envs.VITE_API_URL
            const streamParam = `&stream=${source || 'bootstrap'}`
            // Swap the `/api` suffix for `/ws` so the handshake goes
            // through nginx's WebSocket-upgrading `/ws/` location. The
            // `/api/` block is plain HTTP proxy and drops Upgrade /
            // Connection headers, which silently breaks this WS.
            // In dev `VITE_API_URL` has no `/api` suffix; the regex
            // is a no-op and the request hits the API directly.
            const url = apiUrl.startsWith('http')
                ? `${apiUrl.replace(/^http/, 'ws').replace(/\/api$/, '/ws')}/claws/${clawId}/terminal?token=${encodeURIComponent(token)}${streamParam}`
                : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/claws/${clawId}/terminal?token=${encodeURIComponent(token)}${streamParam}`

            ws = new WebSocket(url)
            ws.onopen = () => setStatus('streaming')
            ws.onmessage = (ev) => {
                const incoming =
                    typeof ev.data === 'string'
                        ? ev.data
                        : new TextDecoder().decode(ev.data as ArrayBuffer)
                const combined = pendingFragmentRef.current + incoming
                const parts = combined.split('\n')
                pendingFragmentRef.current = parts.pop() ?? ''
                const newLines = parts
                    .filter((l) => l.trim())
                    .map(parseLine)
                if (newLines.length === 0) return
                setLines((prev) => {
                    const next = prev.concat(newLines)
                    return next.length > MAX_LINES
                        ? next.slice(next.length - MAX_LINES)
                        : next
                })
            }
            ws.onerror = () => setStatus('error')
        }
        connect()
        return () => {
            cancelled = true
            ws?.close()
        }
    }, [enabled, mockLogs, clawId, source])

    useEffect(() => {
        if (lines.length === 0) return
        if (isFirstLoadRef.current) {
            setTimeout(() => scrollToBottom('instant'), 0)
            isFirstLoadRef.current = false
        } else if (isAtBottomRef.current) {
            setTimeout(() => scrollToBottom('instant'), 0)
        }
    }, [lines])

    useEffect(() => {
        if (!enabled) {
            isFirstLoadRef.current = true
            isAtBottomRef.current = true
        }
    }, [enabled])

    const showPending = status === 'pending' && lines.length === 0
    const showError = status === 'error' && lines.length === 0

    const joined = useMemo(
        () =>
            lines
                .map((l) => (l.time ? `${l.time} ${l.text}` : l.text))
                .join('\n'),
        [lines]
    )

    return (
        <div
            className={`relative ${embedded ? 'flex min-h-0 flex-1 flex-col' : 'h-full'}`}
        >
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className={`overflow-y-auto ${embedded ? 'min-h-0 flex-1' : 'h-full'}`}
            >
                {showPending && embedded && (
                    <div className='bg-foreground/5 h-full w-full animate-pulse' />
                )}
                {showPending && !embedded && (
                    <Skeleton className='border-border h-full w-full rounded-md border' />
                )}
                {showError && (
                    <PanelPlaceholder
                        icon={
                            <ScrollIcon
                                className='text-muted-foreground h-6 w-6'
                                weight='duotone'
                            />
                        }
                        title={t('api.failedToGetLogs')}
                        description={t('api.failedToGetLogsDescription')}
                    />
                )}
                {!embedded && !showPending && !showError && (
                    <pre className='border-border bg-muted text-muted-foreground overflow-auto whitespace-pre-wrap break-words rounded-md border p-3 text-xs leading-snug'>
                        {joined || t('dashboard.diagnosticsNoLogs')}
                    </pre>
                )}
                {embedded && !showPending && !showError && (
                    <div
                        className={`bg-muted/50 flex flex-col gap-1 p-4 ${lines.length === 0 ? 'h-full items-center justify-center' : ''}`}
                    >
                        {lines.length === 0 && (
                            <PanelPlaceholder
                                icon={
                                    <ScrollIcon
                                        className='text-muted-foreground h-6 w-6'
                                        weight='duotone'
                                    />
                                }
                                title={t('dashboard.diagnosticsNoLogs')}
                                description=''
                            />
                        )}
                        {lines.map((line, i) => (
                            <div key={i} className='flex gap-2'>
                                {line.time && (
                                    <span className='text-muted-foreground/60 shrink-0 font-mono text-[10px] leading-4'>
                                        {line.time}
                                    </span>
                                )}
                                <span className='text-foreground/80 min-w-0 whitespace-pre-wrap break-words font-mono text-xs'>
                                    {line.text}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <ScrollToBottomButton
                visible={showButton}
                onClick={() => scrollToBottom('smooth')}
            />
        </div>
    )
}

export default ClawLogsContent