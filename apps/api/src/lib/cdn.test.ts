import CDN_ASSETS from '@/lib/cdn'

describe('CDN_ASSETS', () => {
    it('has LOGO_DARK url', () => {
        expect(CDN_ASSETS.LOGO_DARK).toContain('myclaw-logo-dark.png')
    })

    it('has LOGO_LIGHT url', () => {
        expect(CDN_ASSETS.LOGO_LIGHT).toContain('myclaw-logo-light.png')
    })

    it('all URLs point to myclaw.one', () => {
        for (const url of Object.values(CDN_ASSETS)) {
            expect(url).toMatch(/^https:\/\/myclaw\.one\//)
        }
    })
})