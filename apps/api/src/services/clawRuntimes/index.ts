import type { ClawRuntime } from './types'

import openclawRuntime from './openclaw'
import picoclawRuntime from './picoclaw'

// Registry of claw runtimes. Add a new ClawRuntime here to make the
// type provisionable end-to-end — initiateClawPurchase, curated-plans,
// provisionClawServer all discover types through this map. Nothing
// downstream should hardcode a claw_type string; look it up here.

const runtimes: Record<string, ClawRuntime> = {
    [openclawRuntime.id]: openclawRuntime,
    [picoclawRuntime.id]: picoclawRuntime
}

export const DEFAULT_CLAW_TYPE = openclawRuntime.id

export const getClawRuntime = (clawType: string): ClawRuntime | undefined =>
    runtimes[clawType]

export const listClawRuntimes = (): ClawRuntime[] => Object.values(runtimes)

export const supportedClawTypes = (): Set<string> =>
    new Set(Object.keys(runtimes))

export type { ClawRuntime, GenerateCloudInitParams } from './types'
