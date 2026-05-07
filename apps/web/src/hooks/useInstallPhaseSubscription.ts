import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface InstallPhaseRow {
    id: string
    clawId: string
    installRunId: string
    phase: string
    logChunk: string
    createdAt: string
}

interface UseInstallPhaseOptions {
    clawId: string | null
    installRunId: string | null
    enabled?: boolean
}

interface UseInstallPhaseResult {
    rows: InstallPhaseRow[]
    latestPhase: string | null
    connected: boolean
    error: Error | null
}

// Subscribes to claw_install_phases rows for the active install run.
// Filtering on (claw_id, install_run_id) at the Supabase Realtime layer
// keeps the channel quiet even when the table has rows from other
// claws / older runs of the same claw — see docs/aios-design.md §5
// (single Realtime source) for the rationale.
//
// Returns rows in insertion order; the latest one's `phase` is the
// canonical animation cursor (no separate claws.install_phase column).
const useInstallPhaseSubscription = ({
    clawId,
    installRunId,
    enabled = true
}: UseInstallPhaseOptions): UseInstallPhaseResult => {
    const [rows, setRows] = useState<InstallPhaseRow[]>([])
    const [connected, setConnected] = useState(false)
    const [error, setError] = useState<Error | null>(null)
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(
        null
    )

    useEffect(() => {
        if (!enabled || !clawId || !installRunId) return undefined
        let cancelled = false

        // 1. Initial backfill — Realtime only delivers events that
        // happen AFTER the channel subscribes, so we need a one-shot
        // SELECT to catch up on rows already in the table for this run.
        const backfill = async () => {
            const { data, error: selErr } = await supabase
                .from('claw_install_phases')
                .select('*')
                .eq('claw_id', clawId)
                .eq('install_run_id', installRunId)
                .order('created_at', { ascending: true })
            if (cancelled) return
            if (selErr) {
                setError(new Error(selErr.message))
                return
            }
            if (data) {
                setRows(
                    data.map((r) => ({
                        id: r.id,
                        clawId: r.claw_id,
                        installRunId: r.install_run_id,
                        phase: r.phase,
                        logChunk: r.log_chunk,
                        createdAt: r.created_at
                    }))
                )
            }
        }

        // 2. Realtime channel for live appends.
        const channel = supabase
            .channel(`install-phases-${clawId}-${installRunId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'claw_install_phases',
                    filter: `install_run_id=eq.${installRunId}`
                },
                (payload) => {
                    const r = payload.new as Record<string, unknown>
                    // Defensive: a different claw's row should not slip
                    // through, but the schema-level filter only checks
                    // install_run_id (run IDs are ULIDs so collisions
                    // are negligible — still, belt + suspenders).
                    if (r.claw_id !== clawId) return
                    setRows((prev) => [
                        ...prev,
                        {
                            id: String(r.id),
                            clawId: String(r.claw_id),
                            installRunId: String(r.install_run_id),
                            phase: String(r.phase),
                            logChunk: String(r.log_chunk),
                            createdAt: String(r.created_at)
                        }
                    ])
                }
            )
            .subscribe((status) => {
                if (cancelled) return
                setConnected(status === 'SUBSCRIBED')
            })

        channelRef.current = channel
        void backfill()

        return () => {
            cancelled = true
            void supabase.removeChannel(channel)
            channelRef.current = null
        }
    }, [clawId, installRunId, enabled])

    const latestPhase = rows.length > 0 ? rows[rows.length - 1].phase : null

    return { rows, latestPhase, connected, error }
}

export default useInstallPhaseSubscription