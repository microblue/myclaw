import { createClient } from '@supabase/supabase-js'

// Service-role client. Bypasses RLS; used for server-side admin ops and
// for verifying user-supplied JWTs via auth.getUser(). Lives at module
// scope so the underlying fetch keep-alive and any internal caches are
// shared across requests.
const supabaseUrl = process.env.SUPABASE_URL
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
        'SUPABASE_URL and SUPABASE_SECRET_KEY must be set in env'
    )
}

export const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
        // Server-side: don't persist sessions, don't auto-refresh tokens.
        // Each request hands us a JWT and we verify it statelessly.
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
})

// Returns the auth.users row if the JWT is valid and not expired,
// else null. Does not consult public.users — caller is responsible
// for any subsequent profile lookup.
export async function verifyJwt(token: string) {
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return null
    return data.user
}