import GatewayClient from '@/lib/gateway/GatewayClient'

const clients = new Map<string, GatewayClient>()
const refCounts = new Map<string, number>()

const tokens = new Map<string, string>()

const acquire = (subdomain: string, token: string): GatewayClient => {
    const existing = clients.get(subdomain)
    if (existing) {
        if (tokens.get(subdomain) !== token) {
            existing.disconnect()
            clients.delete(subdomain)
            refCounts.delete(subdomain)
            tokens.delete(subdomain)
        } else {
            refCounts.set(subdomain, (refCounts.get(subdomain) || 0) + 1)
            return existing
        }
    }

    const client = new GatewayClient(subdomain, token)
    clients.set(subdomain, client)
    tokens.set(subdomain, token)
    refCounts.set(subdomain, 1)
    client.connect()
    return client
}

const release = (subdomain: string): void => {
    const count = (refCounts.get(subdomain) || 0) - 1
    if (count <= 0) {
        const client = clients.get(subdomain)
        if (client) client.disconnect()
        clients.delete(subdomain)
        refCounts.delete(subdomain)
        tokens.delete(subdomain)
    } else {
        refCounts.set(subdomain, count)
    }
}

const SharedGateway = { acquire, release }

export default SharedGateway