import hetzner from './hetzner'
import lightsail from './lightsail'
import digitalocean from './digitalocean'

const curatedByProvider: Record<string, readonly string[]> = {
    hetzner,
    lightsail,
    digitalocean
}

export const getCuratedPlanIds = (providerId: string): readonly string[] =>
    curatedByProvider[providerId] ?? []

export default curatedByProvider