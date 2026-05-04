import type { FC, ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import type { AuthProviderProps, CachedProfile } from '@/ts/Interfaces'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { api } from '@/lib'
import AuthContext from '@/lib/auth/AuthContext'
import {
    PROFILE_QUERY_KEY,
    CLAWS_QUERY_KEY,
    USER_STATS_QUERY_KEY
} from '@/hooks'
import readCachedProfile, {
    PROFILE_CACHE_KEY
} from '@/lib/auth/AuthProvider/readCachedProfile'

const AuthProvider: FC<AuthProviderProps> = ({ children }): ReactNode => {
    const queryClient = useQueryClient()
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)
    const [cachedProfile, setCachedProfile] = useState<CachedProfile | null>(
        readCachedProfile
    )
    const fetchedRef = useRef(false)

    useEffect(() => {
        const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
            if (
                event.type === 'updated' &&
                event.action.type === 'success' &&
                event.query.queryKey[0] === PROFILE_QUERY_KEY[0]
            ) {
                const profile = event.query.state.data as
                    | CachedProfile
                    | undefined
                if (profile) {
                    const existing = localStorage.getItem(PROFILE_CACHE_KEY)
                    const serialized = JSON.stringify(profile)
                    if (existing !== serialized) {
                        setCachedProfile(profile)
                        localStorage.setItem(PROFILE_CACHE_KEY, serialized)
                    }
                }
            }
        })
        return unsubscribe
    }, [queryClient])

    const updateCachedProfile = useCallback((data: Partial<CachedProfile>) => {
        setCachedProfile((prev) => {
            const updated = { ...prev, ...data } as CachedProfile
            const existing = localStorage.getItem(PROFILE_CACHE_KEY)
            const serialized = JSON.stringify(updated)
            if (existing !== serialized) {
                localStorage.setItem(PROFILE_CACHE_KEY, serialized)
            }
            return updated
        })
    }, [])

    useEffect(() => {
        // Hydrate from existing session and subscribe to auth changes.
        // supabase-js persists the session in localStorage, so on a hard
        // reload we get an immediate user without a network round-trip.
        supabase.auth.getSession().then(({ data }) => {
            setUser(data.session?.user ?? null)
            setLoading(false)
        })

        const {
            data: { subscription }
        } = supabase.auth.onAuthStateChange(async (_event, session) => {
            setUser(session?.user ?? null)
            setLoading(false)

            if (session?.user) {
                const cached = readCachedProfile()
                if (cached) {
                    setCachedProfile(cached)
                    queryClient.setQueryData(PROFILE_QUERY_KEY, cached)
                }

                if (fetchedRef.current) return
                fetchedRef.current = true

                try {
                    await Promise.all([
                        queryClient.fetchQuery({
                            queryKey: PROFILE_QUERY_KEY,
                            queryFn: api.getProfile,
                            staleTime: 0
                        }),
                        queryClient.prefetchQuery({
                            queryKey: CLAWS_QUERY_KEY,
                            queryFn: () => api.getClaws()
                        }),
                        queryClient.prefetchQuery({
                            queryKey: USER_STATS_QUERY_KEY,
                            queryFn: api.getUserStats
                        })
                    ])
                } catch {
                    await supabase.auth.signOut()
                }
            } else {
                fetchedRef.current = false
                localStorage.removeItem(PROFILE_CACHE_KEY)
                setCachedProfile(null)
                queryClient.clear()
            }
        })
        return () => subscription.unsubscribe()
    }, [queryClient])

    const signOut = useCallback(async () => {
        await supabase.auth.signOut()
    }, [])

    const isLocal =
        typeof document !== 'undefined' &&
        document.documentElement.getAttribute('data-electron') === 'true'

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                cachedProfile,
                updateCachedProfile,
                signOut,
                isLocal
            }}
        >
            {children}
        </AuthContext.Provider>
    )
}

export default AuthProvider
