import { userRole } from '#shared/index'

describe('userRole', () => {
    it('has user role (= end-user surface, lands on /aios)', () => {
        expect(userRole.user).toBe('user')
    })

    it('has admin role (= super-admin, lands on /admin)', () => {
        expect(userRole.admin).toBe('admin')
    })

    it('has partner role (= channel partner, lands on /partner)', () => {
        expect(userRole.partner).toBe('partner')
    })

    it('has exactly 3 roles', () => {
        expect(Object.keys(userRole)).toHaveLength(3)
    })
})