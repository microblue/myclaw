import type { FC } from 'react'

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import { PageTitle } from '@/components'
import { Button } from '@/components/ui'
import useClaw from '@/hooks/useClaws/useClaw'
import { supabase } from '@/lib/supabase'

// Three-pane Intent detail per docs/aios-design.md §6:
//   left   chat (messages, infinite scroll, send)
//   middle outline (computed claw-side from messages)
//   right  artifacts (file pointers + download / verify)
//
// This first cut renders the layout + wires the messages and outline
// fetches against the Studio fork's /api/myclaw/intents/:id/{messages,outline}
// endpoints. The send-message + artifact flows are stubbed; full
// chat-send semantics need orchestrator routing + @-mention parsing
// which lands as a follow-up.

interface ClawResponse {
    id: string
    name: string
    subdomain: string | null
}

interface Message {
    id: string
    role: 'user' | 'assistant' | 'system'
    text: string
    createdAt: string
    agentKey?: string
}

interface OutlineNode {
    id: string
    title: string
    preview: string
    role: string
    createdAt: string
}

const fetchWithAuth = async (url: string): Promise<Response> => {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) throw new Error('Not signed in')
    return fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        credentials: 'include'
    })
}

const Detail: FC = () => {
    const { clawId = '', intentId = '' } = useParams<{
        clawId: string
        intentId: string
    }>()
    const navigate = useNavigate()
    const clawQuery = useClaw(clawId)

    const raw = clawQuery.data as
        | { data?: ClawResponse | null }
        | ClawResponse
        | null
        | undefined
    const claw =
        raw && typeof raw === 'object' && 'data' in raw
            ? raw.data
            : (raw as ClawResponse | null | undefined)
    const studioBase =
        claw?.subdomain ? `https://${claw.subdomain}.myclaw.one` : ''

    const [messages, setMessages] = useState<Message[]>([])
    const [outline, setOutline] = useState<OutlineNode[]>([])
    const [error, setError] = useState<string | null>(null)
    const [loadingMessages, setLoadingMessages] = useState(false)
    const [loadingOutline, setLoadingOutline] = useState(false)

    useEffect(() => {
        if (!studioBase || !intentId) return
        let cancelled = false
        setLoadingMessages(true)
        fetchWithAuth(
            `${studioBase}/api/myclaw/intents/${intentId}/messages?limit=100`
        )
            .then(async (r) => {
                if (cancelled) return
                if (!r.ok) {
                    const body = await r.text()
                    throw new Error(`messages ${r.status}: ${body.slice(0, 200)}`)
                }
                const body = (await r.json()) as { messages: Message[] }
                if (!cancelled) setMessages(body.messages ?? [])
            })
            .catch((err) => {
                if (!cancelled)
                    setError(err instanceof Error ? err.message : 'fetch failed')
            })
            .finally(() => {
                if (!cancelled) setLoadingMessages(false)
            })
        return () => {
            cancelled = true
        }
    }, [studioBase, intentId])

    useEffect(() => {
        if (!studioBase || !intentId) return
        let cancelled = false
        setLoadingOutline(true)
        fetchWithAuth(
            `${studioBase}/api/myclaw/intents/${intentId}/outline`
        )
            .then(async (r) => {
                if (cancelled) return
                if (!r.ok) return // outline is optional; don't error the page
                const body = (await r.json()) as { outline: OutlineNode[] }
                if (!cancelled) setOutline(body.outline ?? [])
            })
            .catch(() => {
                /* outline is best-effort */
            })
            .finally(() => {
                if (!cancelled) setLoadingOutline(false)
            })
        return () => {
            cancelled = true
        }
    }, [studioBase, intentId])

    return (
        <AppShell>
            <PageTitle title={`Intent · ${claw?.name ?? clawId}`} noIndex />
            <main className='mx-auto h-[calc(100vh-4rem)] w-full max-w-7xl px-4 py-4 md:px-6'>
                <header className='mb-4 flex items-center justify-between'>
                    <div>
                        <h1 className='text-xl font-semibold'>
                            {claw?.name ?? 'Loading…'}
                        </h1>
                        <p className='text-muted-foreground text-xs'>
                            Intent {intentId.slice(0, 8)}
                        </p>
                    </div>
                    <Button
                        variant='outline'
                        size='sm'
                        onClick={() => navigate(`/aios/${clawId}`)}
                    >
                        Back to AI-OS
                    </Button>
                </header>

                {error && (
                    <div className='mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive'>
                        {error}
                    </div>
                )}

                <div className='grid h-[calc(100%-4rem)] grid-cols-1 gap-4 md:grid-cols-[1fr_280px_240px]'>
                    {/* Chat pane */}
                    <section className='border-border bg-card flex min-h-0 flex-col rounded-lg border'>
                        <div className='border-border border-b px-4 py-2 text-sm font-medium'>
                            Chat
                        </div>
                        <div className='min-h-0 flex-1 overflow-auto p-4'>
                            {loadingMessages && messages.length === 0 ? (
                                <p className='text-muted-foreground text-sm'>
                                    Loading messages…
                                </p>
                            ) : messages.length === 0 ? (
                                <p className='text-muted-foreground text-sm'>
                                    No messages yet. The orchestrator will
                                    appear here once you start the Intent.
                                </p>
                            ) : (
                                <ul className='space-y-3'>
                                    {messages.map((m) => (
                                        <li
                                            key={m.id}
                                            className={`rounded-md p-3 text-sm ${
                                                m.role === 'user'
                                                    ? 'bg-primary/10'
                                                    : 'bg-muted'
                                            }`}
                                        >
                                            <div className='text-muted-foreground mb-1 text-xs uppercase'>
                                                {m.agentKey ?? m.role}
                                            </div>
                                            <div className='whitespace-pre-wrap'>
                                                {m.text}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className='border-border border-t p-3'>
                            <p className='text-muted-foreground text-xs italic'>
                                Send is wired in P4 follow-up — orchestrator
                                routing + @-mention parsing pending.
                            </p>
                        </div>
                    </section>

                    {/* Outline pane */}
                    <section className='border-border bg-card flex min-h-0 flex-col rounded-lg border'>
                        <div className='border-border border-b px-4 py-2 text-sm font-medium'>
                            Outline
                        </div>
                        <div className='min-h-0 flex-1 overflow-auto p-3'>
                            {loadingOutline && outline.length === 0 ? (
                                <p className='text-muted-foreground text-sm'>
                                    Building outline…
                                </p>
                            ) : outline.length === 0 ? (
                                <p className='text-muted-foreground text-sm'>
                                    No sections yet.
                                </p>
                            ) : (
                                <ol className='space-y-2 text-sm'>
                                    {outline.map((n) => (
                                        <li
                                            key={n.id}
                                            className='border-border border-l-2 pl-3'
                                        >
                                            <div className='font-medium'>
                                                {n.title}
                                            </div>
                                            <div className='text-muted-foreground line-clamp-2 text-xs'>
                                                {n.preview}
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </div>
                    </section>

                    {/* Artifacts pane */}
                    <section className='border-border bg-card flex min-h-0 flex-col rounded-lg border'>
                        <div className='border-border border-b px-4 py-2 text-sm font-medium'>
                            Artifacts
                        </div>
                        <div className='min-h-0 flex-1 overflow-auto p-3'>
                            <p className='text-muted-foreground text-sm'>
                                No artifacts yet. Files agents create will
                                appear here with download + sha256 verify.
                            </p>
                        </div>
                    </section>
                </div>
            </main>
        </AppShell>
    )
}

export default Detail