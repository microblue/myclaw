import { RequestClient } from '@openclaw/shared'
import { supabase, getCachedToken } from '@/lib/supabase'
import Envs from '@/lib/Envs'

const BASE_URL = Envs.VITE_API_URL

// supabase-js auto-refreshes access tokens before expiry, so the
// onUnauthorized hook only fires when refresh itself failed (e.g. the
// refresh token is gone or revoked). In that case we sign out and let
// the SPA bounce to /login on the next render.
const client = new RequestClient({
    baseUrl: BASE_URL,
    getHeaders: async (): Promise<Record<string, string>> => {
        const token = await getCachedToken()
        const headers: Record<string, string> = {}
        if (token) headers.Authorization = `Bearer ${token}`
        return headers
    },
    onUnauthorized: async (): Promise<boolean> => {
        const { data, error } = await supabase.auth.refreshSession()
        if (error || !data.session) {
            await supabase.auth.signOut()
            return false
        }
        return true
    }
})

const publicClient = new RequestClient({
    baseUrl: BASE_URL
})

export { client, publicClient, BASE_URL }