import { createClient } from '@supabase/supabase-js'
import Envs from '@/lib/Envs'

// Single Supabase client for the SPA. Uses the anon key — RLS gates
// what this client can read/write directly. Auth state (session +
// access token) is persisted in localStorage by supabase-js itself.
export const supabase = createClient(Envs.VITE_SUPABASE_URL, Envs.VITE_SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
    }
})

// Returns the current access token (JWT) or null. Used by api/client.ts
// to attach Authorization headers; supabase-js refreshes the token in
// the background, so callers don't need to worry about expiry.
export async function getCachedToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
}