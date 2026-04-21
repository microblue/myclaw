import type { ClawRuntime, GenerateCloudInitParams } from './types'

import generateOpenclawCloudInit from '@/controllers/claws/helpers/generateCloudInit'
import hetznerCuratedPlans from '@/services/providers/curatedPlans/hetzner'
import lightsailCuratedPlans from '@/services/providers/curatedPlans/lightsail'
import digitaloceanCuratedPlans from '@/services/providers/curatedPlans/digitalocean'

// Thin adapter around the existing OpenClaw cloud-init + curated plan
// lists. The generator is called unchanged (positional args -> the
// registry's param-object shape is just the marshalling here) so the
// output is byte-for-byte identical to pre-registry behavior and
// rolling out PicoClaw can't accidentally regress OpenClaw provisions.

const openclawRuntime: ClawRuntime = {
    id: 'openclaw',
    systemdUnit: 'openclaw-gateway',
    gatewayPort: 18789,
    generateCloudInit: (p: GenerateCloudInitParams) =>
        generateOpenclawCloudInit(
            p.rootPassword,
            p.subdomain,
            p.domain,
            p.gatewayToken,
            p.llm
        ),
    curatedPlanIdsByProvider: {
        hetzner: hetznerCuratedPlans,
        lightsail: lightsailCuratedPlans,
        digitalocean: digitaloceanCuratedPlans
    }
}

export default openclawRuntime