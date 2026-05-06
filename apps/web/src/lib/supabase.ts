import { createClient } from '@supabase/supabase-js'
import Envs from '@/lib/Envs'

// supabase-js's default cross-tab `navigator.locks` lock has a stuck-
// release failure mode: if a tab is hard-killed (closed mid-refresh,
// nav interrupted, etc.) the held lock isn't always released, and
// every subsequent `auth.getSession()` / `auth.refreshSession()` call
// in the next session blocks forever waiting on the orphan lock. The
// SPA is single-tab in practice, so we don't need cross-tab
// coordination — replace the lock with a no-op that just runs the fn.
const noopLock = async <R>(
    _name: string,
    _acquireTimeout: number,
    fn: () => Promise<R>
): Promise<R> => fn()

// Single Supabase client for the SPA. Uses the anon key — RLS gates
// what this client can read/write directly. Auth state (session +
// access token) is persisted in localStorage by supabase-js itself.
export const supabase = createClient(
    Envs.VITE_SUPABASE_URL,
    Envs.VITE_SUPABASE_ANON_KEY,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            lock: noopLock
        }
    }
)

// In-memory cache of the current access token. Populated synchronously
// from `supabase.auth.onAuthStateChange` so request-time token lookup
// never has to await an internal supabase-js call (which historically
// has been a source of deadlocks). Falls back to the token persisted
// in localStorage by supabase-js for the very first request after
// page load, before the auth listener has had a chance to fire.
let cachedAccessToken: string | null = (() => {
    try {
        const ref = Envs.VITE_SUPABASE_URL.replace(
            /^https?:\/\/([a-z0-9]+)\.supabase\.co.*$/i,
            '$1'
        )
        const raw = localStorage.getItem(`sb-${ref}-auth-token`)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        return parsed?.access_token ?? null
    } catch {
        return null
    }
})()

supabase.auth.onAuthStateChange((_event, session) => {
    cachedAccessToken = session?.access_token ?? null
})

// Returns the current access token (JWT) or null. Used by api/client.ts
// to attach Authorization headers. Synchronous-via-Promise so the call
// site doesn't accidentally serialize requests on a cross-tab lock.
export async function getCachedToken(): Promise<string | null> {
    return cachedAccessToken
}