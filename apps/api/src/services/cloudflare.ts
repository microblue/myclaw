import type {
    CacheEntry,
    CloudflareDNSRecord,
    CloudflareDNSLookup
} from '@/ts/Interfaces'

import Cloudflare from 'cloudflare'
import DOMAIN from '@/controllers/claws/helpers/constants'

const getClient = () => {
    const token = process.env.CLOUDFLARE_API_TOKEN
    if (!token) throw new Error('CLOUDFLARE_API_TOKEN is not set')

    return new Cloudflare({ apiToken: token })
}

const getZoneId = () => {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID
    if (!zoneId) throw new Error('CLOUDFLARE_ZONE_ID is not set')
    return zoneId
}

const DNS_CACHE_TTL = 30_000
const dnsCache = new Map<string, CacheEntry<CloudflareDNSLookup | null>>()
const dnsInflight = new Map<string, Promise<CloudflareDNSLookup | null>>()

// Exponential-backoff retry around Cloudflare SDK calls. Every write
// path through this module is now async-fatal if retries exhaust:
// previous fire-and-forget patterns lost transient CF 5xx / rate-limit
// errors and left claws with missing DNS forever (symptom: gentle-owl
// stuck in `configuring`, NXDOMAIN, certbot failing). Retry budget is
// generous — Cloudflare outages usually clear within a few seconds,
// and the caller path (claw provisioning) is user-blocking so waiting
// a bit beats failing outright.
const RETRY_ATTEMPTS = 5
const RETRY_BASE_MS = 500
const withRetry = async <T>(op: string, fn: () => Promise<T>): Promise<T> => {
    let lastErr: unknown = null
    for (let i = 0; i < RETRY_ATTEMPTS; i++) {
        try {
            return await fn()
        } catch (err) {
            lastErr = err
            if (i === RETRY_ATTEMPTS - 1) break
            const delay = RETRY_BASE_MS * 2 ** i
            console.warn(
                `[cloudflare] ${op} attempt ${i + 1}/${RETRY_ATTEMPTS} failed, retrying in ${delay}ms:`,
                err instanceof Error ? err.message : err
            )
            await new Promise((r) => setTimeout(r, delay))
        }
    }
    throw lastErr instanceof Error
        ? lastErr
        : new Error(`cloudflare ${op} failed`)
}

const cloudflare = {
    async createDNSRecord(
        subdomain: string,
        ip: string
    ): Promise<CloudflareDNSRecord> {
        const client = getClient()
        const zoneId = getZoneId()

        const record = await withRetry(
            `createDNSRecord(${subdomain} → ${ip})`,
            () =>
                client.dns.records.create({
                    zone_id: zoneId,
                    type: 'A',
                    name: subdomain,
                    content: ip,
                    proxied: false,
                    ttl: 60
                })
        )

        dnsCache.delete(subdomain)

        return {
            id: record.id!,
            name: record.name!
        }
    },

    async updateDNSRecord(
        recordId: string,
        subdomain: string,
        ip: string
    ): Promise<void> {
        const client = getClient()
        const zoneId = getZoneId()

        await withRetry(`updateDNSRecord(${subdomain} → ${ip})`, () =>
            client.dns.records.update(recordId, {
                zone_id: zoneId,
                type: 'A',
                name: subdomain,
                content: ip,
                ttl: 60
            })
        )

        dnsCache.delete(subdomain)
    },

    async deleteDNSRecord(recordId: string): Promise<void> {
        const client = getClient()
        const zoneId = getZoneId()

        await withRetry(`deleteDNSRecord(${recordId})`, () =>
            client.dns.records.delete(recordId, { zone_id: zoneId })
        )
    },

    // List all A records in the zone. Used by the reconcile job to
    // find orphans (records whose subdomain no longer matches any
    // live claw in the DB).
    async listAllDNSRecords(): Promise<
        { id: string; name: string; content: string }[]
    > {
        const client = getClient()
        const zoneId = getZoneId()

        const records = await withRetry('listAllDNSRecords', () =>
            client.dns.records.list({
                zone_id: zoneId,
                type: 'A',
                per_page: 500
            })
        )

        return (records.result || []).map((r) => ({
            id: r.id!,
            name: r.name!,
            content: r.content as string
        }))
    },

    async findDNSRecord(
        subdomain: string
    ): Promise<CloudflareDNSLookup | null> {
        const entry = dnsCache.get(subdomain)
        if (entry && Date.now() < entry.expiry) return entry.data

        const pending = dnsInflight.get(subdomain)
        if (pending) return pending

        const client = getClient()
        const zoneId = getZoneId()
        const fullName = `${subdomain}.${DOMAIN}`

        const promise = withRetry(`findDNSRecord(${fullName})`, () =>
            client.dns.records.list({
                zone_id: zoneId,
                name: { exact: fullName },
                type: 'A'
            })
        )
            .then((records) => {
                const record = records.result?.[0]
                const result: CloudflareDNSLookup | null = record
                    ? { id: record.id!, ip: record.content as string }
                    : null
                dnsCache.set(subdomain, {
                    data: result,
                    expiry: Date.now() + DNS_CACHE_TTL
                })
                dnsInflight.delete(subdomain)
                return result
            })
            .catch((err) => {
                dnsInflight.delete(subdomain)
                throw err
            })

        dnsInflight.set(subdomain, promise)
        return promise
    }
}

export default cloudflare