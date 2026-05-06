import type { AuthCacheData, CacheEntry } from '@/ts/Interfaces'
import type { HonoEnv } from '@/ts/Types'

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { compress } from 'hono/compress'
import { logger } from 'hono/logger'
import { bodyLimit } from 'hono/body-limit'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { externalUrls, userRole } from '@openclaw/shared'
import { environment } from '@/lib/constants'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'
import { browseSkills } from '@/services/clawhub'
import { verifyJwt } from '@/services/supabase'

import {
    adminRoutes,
    affiliateRoutes,
    aiRoutes,
    clawsRoutes,
    cronRoutes,
    plansRoutes,
    providersRoutes,
    sshKeysRoutes,
    usersRoutes,
    waitlistRoutes,
    webhooksRoutes,
    installReportsRoutes,
    cloudScriptsRoutes,
    partnerRoutes
} from '@/routes'

const app = new Hono<HonoEnv>()

const isDev = process.env.NODE_ENV !== environment.production

app.use(
    '*',
    cors({
        origin: isDev
            ? [
                  externalUrls.CLAWHOST.BASE,
                  externalUrls.CLAWHOST.WWW,
                  'http://localhost:1111',
                  'https://localhost:1111'
              ]
            : [externalUrls.CLAWHOST.BASE, externalUrls.CLAWHOST.WWW],
        allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization', 'X-Referral-Code'],
        exposeHeaders: ['X-Sample-Rate', 'X-Channels', 'X-Audio-Format'],
        maxAge: 86400
    })
)

app.use('*', compress())
app.use('*', logger())
app.use('*', bodyLimit({ maxSize: 1024 * 1024 }))

app.use('*', async (c, next) => {
    await next()
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('X-Frame-Options', 'DENY')
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
})

app.get('/', (c) => ok(c, null, t('api.healthOk')))

app.route('/cron', cronRoutes)
app.route('/plans', plansRoutes)
app.route('/providers', providersRoutes)
app.route('/waitlist', waitlistRoutes)
app.route('/webhooks', webhooksRoutes)
app.route('/install-reports', installReportsRoutes)
app.route('/cloud-scripts', cloudScriptsRoutes)
app.get('/clawhub/skills', async (c) => {
    try {
        const result = await browseSkills({
            query: c.req.query('query') || undefined,
            limit: c.req.query('limit')
                ? Number(c.req.query('limit'))
                : undefined,
            cursor: c.req.query('cursor') || undefined
        })
        return ok(
            c,
            {
                skills: result.skills,
                nextCursor: result.nextCursor,
                hasMore: result.hasMore
            },
            t('api.clawHubSearchSuccess')
        )
    } catch {
        return fail(c, t('api.clawHubSearchFailed'), 500)
    }
})

const AUTH_CACHE_TTL = 5 * 60 * 1000
const AUTH_CACHE_CLEANUP_INTERVAL = 10 * 60 * 1000
const authCache = new Map<string, CacheEntry<AuthCacheData>>()

setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of authCache) {
        if (now >= entry.expiry) authCache.delete(key)
    }
}, AUTH_CACHE_CLEANUP_INTERVAL)

// Supabase JWT verification. The on_auth_user_created trigger creates
// the public.users row at signup, so by the time a request lands here
// the profile row is guaranteed to exist (or auth.getUser returned null).
app.use('/*', async (c, next) => {
    try {
        const authHeader = c.req.header('Authorization')
        if (!authHeader?.startsWith('Bearer ')) {
            return fail(c, t('api.unauthorized'), 401)
        }
        const token = authHeader.slice(7)

        const cached = authCache.get(token)
        if (cached && Date.now() < cached.expiry) {
            c.set('userId', cached.data.userId)
            c.set('isAdmin', cached.data.isAdmin)
            c.set('userRole', cached.data.role)
            return next()
        }

        const user = await verifyJwt(token)
        if (!user) return fail(c, t('api.invalidToken'), 401)

        const profile = await db
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, user.id))
            .then((rows) => rows[0])

        // Default unknown / missing role to 'user' so we never silently
        // grant elevated access on a malformed profile row.
        const role: 'user' | 'admin' | 'partner' =
            profile?.role === userRole.admin
                ? 'admin'
                : profile?.role === userRole.partner
                  ? 'partner'
                  : 'user'
        const isAdmin = role === 'admin'

        authCache.set(token, {
            data: { userId: user.id, isAdmin, role },
            expiry: Date.now() + AUTH_CACHE_TTL
        })

        c.set('userId', user.id)
        c.set('isAdmin', isAdmin)
        c.set('userRole', role)
        return next()
    } catch (error) {
        console.error('authMiddleware', error)
        return fail(c, t('api.internalServerError'), 500)
    }
})

app.route('/admin', adminRoutes)
app.route('/partner', partnerRoutes)
app.route('/affiliate', affiliateRoutes)
app.route('/ai', aiRoutes)
app.route('/claws', clawsRoutes)
app.route('/ssh-keys', sshKeysRoutes)
app.route('/users', usersRoutes)

app.notFound((c) => fail(c, t('api.notFound'), 404))

export default app