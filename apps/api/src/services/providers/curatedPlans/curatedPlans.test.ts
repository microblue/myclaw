import { describe, it, expect } from 'vitest'

import hetzner from './hetzner'
import lightsail from './lightsail'
import digitalocean from './digitalocean'
import { getCuratedPlanIds } from './index'

describe('curated plan whitelists', () => {
    it('each provider exposes 4 curated plan ids (one per memory tier)', () => {
        expect(hetzner).toHaveLength(4)
        expect(lightsail).toHaveLength(4)
        expect(digitalocean).toHaveLength(4)
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