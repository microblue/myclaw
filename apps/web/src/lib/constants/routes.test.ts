import { ROUTES } from '@/lib/constants'
import { PATHS } from '@/lib'

describe('ROUTES', () => {
    it('HOME is /', () => {
        expect(ROUTES.HOME).toBe('/')
    })

    it('all non-HOME routes start with /', () => {
        const entries = Object.entries(ROUTES).filter(([key]) => key !== 'HOME')
        for (const [, value] of entries) {
            expect(value.startsWith('/')).toBe(true)
        }
    })

    it('routes are derived from PATHS', () => {
        expect(ROUTES.LOGIN).toBe(`/${PATHS.LOGIN}`)
        expect(ROUTES.CLAWS).toBe(`/${PATHS.CLAWS}`)
        expect(ROUTES.BLOG).toBe(`/${PATHS.BLOG}`)
        expect(ROUTES.TERMS).toBe(`/${PATHS.TERMS}`)
        expect(ROUTES.PRIVACY).toBe(`/${PATHS.PRIVACY}`)
    })

    it('BLOG_POST has slug parameter', () => {
        expect(ROUTES.BLOG_POST).toBe(`/${PATHS.BLOG}/:slug`)
    })

    it('admin sub-routes are canonical /admin/<section> URLs', () => {
        expect(ROUTES.ADMIN_ANALYTICS).toBe('/admin/analytics')
        expect(ROUTES.ADMIN_USERS).toBe('/admin/users')
        expect(ROUTES.ADMIN_FLEET).toBe('/admin/fleet')
        expect(ROUTES.ADMIN_BILLING).toBe('/admin/billing')
        expect(ROUTES.ADMIN_CODES).toBe('/admin/codes')
        expect(ROUTES.ADMIN_INSTALL_REPORTS).toBe('/admin/install-reports')
        expect(ROUTES.ADMIN_SETTINGS).toBe('/admin/settings')
    })

    it('aios paths are canonical for end-user flows', () => {
        expect(ROUTES.AIOS).toBe('/aios')
        expect(ROUTES.AIOS_INSTALL).toBe('/aios/install')
        expect(ROUTES.AIOS_INSTALL_PROGRESS).toBe('/aios/install/:id')
        expect(ROUTES.AIOS_DETAIL).toBe('/aios/:id')
    })
})