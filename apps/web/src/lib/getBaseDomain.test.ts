import { getBaseDomain } from '@/lib'

describe('getBaseDomain', () => {
    it('returns myclaw.one for localhost', () => {
        Object.defineProperty(window, 'location', {
            value: { hostname: 'localhost' },
            writable: true
        })
        expect(getBaseDomain()).toBe('myclaw.one')
    })

    it('returns myclaw.one for 127.0.0.1', () => {
        Object.defineProperty(window, 'location', {
            value: { hostname: '127.0.0.1' },
            writable: true
        })
        expect(getBaseDomain()).toBe('myclaw.one')
    })

    it('returns actual hostname for production', () => {
        Object.defineProperty(window, 'location', {
            value: { hostname: 'app.myclaw.one' },
            writable: true
        })
        expect(getBaseDomain()).toBe('app.myclaw.one')
    })
})