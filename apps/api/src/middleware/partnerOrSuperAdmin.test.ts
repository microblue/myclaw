import { Hono } from 'hono'
import { userRole } from '@openclaw/shared'
import partnerOrSuperAdmin from './partnerOrSuperAdmin'

// Gate for routes both super-admin and channel partners can hit
// (e.g. /api/admin/codes/mint, /api/admin/codes list scoped by
// partner_id). End-users and anonymous callers get 403. The downstream
// controller is responsible for SCOPING — partner sees only own rows;
// admin sees all.

const buildApp = (role: string | null | undefined) => {
    const app = new Hono()
    app.use('*', async (c, next) => {
        if (role !== null) c.set('userRole', role)
        await next()
    })
    app.get('/protected', partnerOrSuperAdmin, (c) => c.json({ ok: true }))
    return app
}

describe('partnerOrSuperAdmin', () => {
    it('allows admin role with 200', async () => {
        const res = await buildApp(userRole.admin).request('/protected')
        expect(res.status).toBe(200)
    })

    it('allows partner role with 200', async () => {
        const res = await buildApp(userRole.partner).request('/protected')
        expect(res.status).toBe(200)
    })

    it('rejects end-user role with 403', async () => {
        const res = await buildApp(userRole.user).request('/protected')
        expect(res.status).toBe(403)
    })

    it('rejects when userRole is missing (anonymous request)', async () => {
        const res = await buildApp(null).request('/protected')
        expect(res.status).toBe(403)
    })

    it('rejects unknown role values defensively', async () => {
        const res = await buildApp('reseller').request('/protected')
        expect(res.status).toBe(403)
    })

    it('returns a structured failure body', async () => {
        const res = await buildApp(userRole.user).request('/protected')
        const body = (await res.json()) as { success: boolean }
        expect(body.success).toBe(false)
    })
})