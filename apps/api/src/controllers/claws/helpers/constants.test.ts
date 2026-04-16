import { DOMAIN } from '@/controllers/claws/helpers'

describe('DOMAIN', () => {
    it('is myclaw.one', () => {
        expect(DOMAIN).toBe('myclaw.one')
    })
})