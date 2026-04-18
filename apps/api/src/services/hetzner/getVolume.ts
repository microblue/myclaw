import type { HetznerVolumeResponse, VolumeDetails } from '@/ts/Interfaces'

import getClient from '@/services/hetzner/hetznerClient'

const getVolume = async (volumeId: number): Promise<VolumeDetails> => {
    const data = await getClient().get<HetznerVolumeResponse>(
        `/volumes/${volumeId}`
    )
    return {
        id: data.volume.id,
        name: data.volume.name,
        size: data.volume.size,
        status: data.volume.status,
        serverId: data.volume.server,
        location: data.volume.location.name
    }
}

export default getVolume