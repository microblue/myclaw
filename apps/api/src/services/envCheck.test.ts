import { describe, it, expect } from 'vitest'

import { isPlaceholder } from '@/services/envCheck'

describe('envCheck.isPlaceholder', () => {
    it('flags the "your-*" exemplar that bit prod', () => {
        expect(isPlaceholder('your-cloudflare-api-token')).toBe(true)
        expect(isPlaceholder('your_token')).toBe(true)
        expect(isPlaceholder('YOUR-TOKEN')).toBe(true)
    })

    it('flags common dummy-value sentinels', () => {
        expect(isPlaceholder('placeholder')).toBe(true)
        expect(isPlaceholder('replace_me')).toBe(true)
        expect(isPlaceholder('replace-me')).toBe(true)
        expect(isPlaceholder('changeme')).toBe(true)
        expect(isPlaceholder('xxxxxxxx')).toBe(true)
        expect(isPlaceholder('<paste-here>')).toBe(true)
    })

    it('accepts real-looking values', () => {
        expect(
            isPlaceholder('cfut_xDeebdgRoTIYWH5khDZpCn4islFWiq6dDBeIya2M')
        ).toBe(false)
        expect(
            isPlaceholder('44177f547cf67fe957dff6f810a2b58d')
        ).toBe(false)
        expect(
            isPlaceholder(
                'postgres://clawhost:pw@localhost:5432/clawhost?sslmode=disable'
            )
        ).toBe(false)
        // Values that happen to contain "your" but aren't placeholders.
        expect(isPlaceholder('sk-my-yourtest-bucket-123')).toBe(false)
    })
})