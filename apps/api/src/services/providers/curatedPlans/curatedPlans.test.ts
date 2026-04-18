import { describe, it, expect } from 'vitest'

import hetzner from './hetzner'
import lightsail from './lightsail'
import digitalocean from './digitalocean'
import { getCuratedPlanIds } from './index'

describe('curated plan whitelists', () => {
    it('each provider exposes exactly 12 curated plan ids', () => {
        expect(hetzner).toHaveLength(12)
        expect(lightsail).toHaveLength(12)
        expect(digitalocean).toHaveLength(12)
    })

    it('each list has no duplicates', () => {
        for (const list of [hetzner, lightsail, digitalocean]) {
            expect(new Set(list).size).toBe(list.length)
        }
    })

    it('getCuratedPlanIds returns the matching list by provider id', () => {
        expect(getCuratedPlanIds('hetzner')).toBe(hetzner)
        expect(getCuratedPlanIds('lightsail')).toBe(lightsail)
        expect(getCuratedPlanIds('digitalocean')).toBe(digitalocean)
    })

    it('getCuratedPlanIds returns an empty array for unknown providers', () => {
        expect(getCuratedPlanIds('ghost')).toEqual([])
    })
})