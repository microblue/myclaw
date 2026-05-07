import { apiPaths as API_PATHS } from '@openclaw/shared'
import { client } from '@/lib/api/client'
import { getCachedToken } from '@/lib/supabase'
import Envs from '@/lib/Envs'

// Partner-self-serve API client. Mirrors a subset of the admin client
// but hits /partner/*. The controllers are the same as the admin ones —
// they internally scope by partner_id when called by a partner role.
//
// Super-admin can hit either set; partner UI uses this client because
// the partnerOrSuperAdmin route gate doesn't admit end-users by mistake.
const partner = {
    listCodes: (
        page: number = 1,
        limit: number = 50,
        filters: { status?: string; partner?: string; batch?: string } = {}
    ) => {
        const qs = new URLSearchParams({
            page: String(page),
            limit: String(limit)
        })
        if (filters.status) qs.set('status', filters.status)
        if (filters.partner) qs.set('partner', filters.partner)
        if (filters.batch) qs.set('batch', filters.batch)
        return client.get<{
            items: Array<{
                id: string
                code: string
                planId: string | null
                provider: string | null
                region: string | null
                tierLabel: string | null
                partnerName: string | null
                batchId: string | null
                notes: string | null
                validityDays: number | null
                skuKind: 'new' | 'renewal'
                seats: number
                seatsUsed: number
                status: string
                expiresAt: string | null
                createdAt: string
                redeemedByEmail: string | null
                redeemedClawName: string | null
            }>
            total: number
            page: number
            totalPages: number
        }>(`${API_PATHS.PARTNER.ACTIVATION_CODES}?${qs.toString()}`)
    },
    listBatches: () =>
        client.get<{
            items: Array<{
                batchId: string
                partnerName: string | null
                planId: string | null
                provider: string | null
                region: string | null
                tierLabel: string | null
                validityDays: number | null
                skuKind: 'new' | 'renewal'
                seats: number
                expiresAt: string | null
                createdAt: string
                total: number
                unused: number
                redeemed: number
                voided: number
            }>
        }>(API_PATHS.PARTNER.ACTIVATION_CODE_BATCHES),
    mintBatch: (data: {
        skuKind: 'new' | 'renewal'
        planId: string | null
        provider: string | null
        region: string | null
        tierLabel?: string | null
        partnerName?: string | null
        notes?: string | null
        validityDays: number
        seats: number
        expiresAt?: string | null
        count: number
    }) =>
        client.post<{
            batchId: string
            count: number
            codes: { id: string; code: string }[]
        }>(API_PATHS.PARTNER.ACTIVATION_CODE_BATCHES, data),
    voidCode: (id: string) =>
        client.put<{ id: string; status: string }>(
            API_PATHS.PARTNER.VOID_ACTIVATION_CODE(id),
            {}
        ),
    voidBatch: (batchId: string) =>
        client.put<{ batchId: string; voided: number }>(
            API_PATHS.PARTNER.VOID_ACTIVATION_CODE_BATCH(batchId),
            {}
        ),
    downloadBatchCsv: async (batchId: string): Promise<void> => {
        const token = await getCachedToken()
        const url = `${Envs.VITE_API_URL}${API_PATHS.PARTNER.ACTIVATION_CODE_BATCH_EXPORT(batchId)}`
        const res = await fetch(url, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        })
        if (!res.ok) throw new Error(`Export failed: ${res.status}`)
        const blob = await res.blob()
        const objectUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = objectUrl
        a.download = `activation-codes-${batchId}.csv`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(objectUrl)
    }
}

export default partner