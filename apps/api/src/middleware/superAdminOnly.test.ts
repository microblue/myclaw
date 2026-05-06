import { Hono } from 'hono'
import { userRole } from '@openclaw/shared'
import superAdminOnly from './superAdminOnly'

// `superAdminOnly` is the role-aware successor to the boolean-flagged
// `adminOnly`. It allows only `userRole.admin` through; partners and
// end-users get 403, no-role/anon get 403. Reads `userRole` from context
// (set by the upstream auth middleware in app.ts).

const buildApp = (role: string | null | undefined) => {
    const app = new Hono()
    app.use('*', async (c, next) => {
        if (role !== null) c.set('userRole', role)
        await next()
    })
    app.get('/protected', superAdminOnly, (c) => c.json({ ok: true }))
    return app
}

describe('superAdminOnly', () => {
    it('allows admin role with 200', async () => {
        const res = await buildApp(userRole.admin).request('/protected')
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
    })

    it('rejects partner role with 403', async () => {
        const res = await buildApp(userRole.partner).request('/protected')
        expect(res.status).toBe(403)
    })

    it('rejects end-user role with 403', async () => {
        const res = await buildApp(userRole.user).request('/protected')
        expect(res.status).toBe(403)
    })

    it('rejects when userRole is missing (anonymous request)', async () => {
        const res = await buildApp(null).request('/protected')
        expect(res.status).toBe(403)
    })

    it('rejects when userRole has an unknown value (defense in depth)', async () => {
        const res = await buildApp('superuser').request('/protected')
        expect(res.status).toBe(403)
    })

    it('returns a structured failure body, not an opaque 403', async () => {
        const res = await buildApp(userRole.user).request('/protected')
        const body = (await res.json()) as { success: boolean }
        expect(body.success).toBe(false)
    })
})