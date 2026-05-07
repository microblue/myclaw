import type { FC, FormEvent, ReactNode } from 'react'

import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { useAuth } from '@/lib/auth'
import { useNetworkStatus } from '@/hooks'
import { ROUTES } from '@/lib'
import { supabase } from '@/lib/supabase'
import {
    Logo,
    NetworkStatus,
    PageBackground,
    PageTitle,
    ProductHuntBanner
} from '@/components'
import { CircleNotchIcon } from '@phosphor-icons/react'

const Login: FC = (): ReactNode => {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const { user, loading: authLoading, isLocal } = useAuth()
    const isOffline = useNetworkStatus()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const planParam = searchParams.get('plan')
    const deployParam = searchParams.get('deploy')
    const providerParam = searchParams.get('provider')
    const nextParam = searchParams.get('next')

    // Whitelist of paths the `next` query is allowed to redirect to.
    // Open-redirect protection: never honor an arbitrary external URL
    // even if the SPA is the only thing rendering it (a tab opener or
    // password manager could land on /login?next=https://evil... and
    // bounce the user post-auth without us guarding here).
    const isSafeNext = (raw: string | null): raw is string =>
        !!raw && raw.startsWith('/') && !raw.startsWith('//')

    const getRedirectUrl = () => {
        if (isSafeNext(nextParam)) return nextParam
        if (planParam) {
            const providerSuffix = providerParam
                ? `&provider=${providerParam}`
                : ''
            return `${ROUTES.AIOS}?plan=${planParam}${providerSuffix}`
        }
        if (deployParam) return ROUTES.AIOS_INSTALL
        return ROUTES.AIOS
    }

    useEffect(() => {
        if (user) navigate(getRedirectUrl())
    }, [user, navigate])

    // Single sign-in handler. signUp + immediate signIn would require an
    // extra round-trip; using signInWithPassword and falling back to
    // signUp if the user doesn't exist gives one form for both flows
    // while the email-confirmation step is off.
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault()
        setError(null)
        setSubmitting(true)
        try {
            const { error: signInError } =
                await supabase.auth.signInWithPassword({ email, password })

            if (signInError) {
                if (signInError.message.toLowerCase().includes('invalid')) {
                    const { error: signUpError } = await supabase.auth.signUp({
                        email,
                        password
                    })
                    if (signUpError) throw signUpError
                } else {
                    throw signInError
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Sign-in failed')
        } finally {
            setSubmitting(false)
        }
    }

    if (authLoading || user) {
        return (
            <div className='bg-background text-foreground relative flex min-h-screen items-center justify-center px-4'>
                <PageBackground />
                <CircleNotchIcon className='text-foreground/50 h-8 w-8 animate-spin' />
            </div>
        )
    }

    return (
        <div
            className={`bg-background text-foreground ${isLocal ? 'fixed inset-0 flex flex-col overflow-hidden' : 'relative min-h-screen'}`}
        >
            {isOffline ? <NetworkStatus /> : <ProductHuntBanner />}
            <div className='flex min-h-screen items-center justify-center px-4'>
                <PageTitle
                    title={t('auth.signIn')}
                    description={t('auth.signInDescription')}
                    noIndex
                />
                <PageBackground />
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className='relative w-full max-w-md'
                >
                    <div className='mb-8 flex flex-col items-center'>
                        <div className='mb-6'>
                            <Logo />
                        </div>
                        <h1 className='text-foreground text-center text-2xl font-semibold tracking-tight'>
                            Sign in to MyClaw.One
                        </h1>
                        <p className='text-muted-foreground mt-2 text-center text-sm'>
                            New here? Enter a fresh email + password — your
                            account is created automatically.
                        </p>
                    </div>

                    <form
                        onSubmit={handleSubmit}
                        className='space-y-4 rounded-xl border border-border bg-foreground/5 p-6 backdrop-blur-sm'
                    >
                        <input
                            type='email'
                            required
                            placeholder='you@example.com'
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete='email'
                            className='w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20'
                        />
                        <input
                            type='password'
                            required
                            minLength={6}
                            placeholder='Password (6+ characters)'
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete='current-password'
                            className='w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20'
                        />
                        {error && (
                            <p className='text-sm text-red-500'>{error}</p>
                        )}
                        <button
                            type='submit'
                            disabled={submitting || !email || !password}
                            className='flex w-full items-center justify-center gap-2 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50'
                        >
                            {submitting && (
                                <CircleNotchIcon className='h-4 w-4 animate-spin' />
                            )}
                            Continue
                        </button>
                    </form>
                    <p className='text-muted-foreground mt-4 text-center text-xs'>
                        By continuing you agree to our{' '}
                        <Link to={ROUTES.TERMS} className='underline'>
                            Terms
                        </Link>{' '}
                        and{' '}
                        <Link to={ROUTES.PRIVACY} className='underline'>
                            Privacy Policy
                        </Link>
                        .
                    </p>
                </motion.div>
            </div>
        </div>
    )
}

export default Login