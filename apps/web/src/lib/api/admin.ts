import type {
    AdminAnalyticsResponse,
    AdminBillingApiResponse,
    AdminClawsResponse,
    AdminEmailListItem,
    AdminExportListItem,
    AdminPaginatedResponse,
    AdminPendingClawListItem,
    AdminReferralListItem,
    AdminSSHKeysResponse,
    AdminStats,
    AdminUserDetail,
    AdminUsersResponse,
    AdminVolumesResponse,
    AdminWaitlistListItem,
    UpdateAdminUserData
} from '@/ts/Interfaces'
import type { AdminAnalyticsRange } from '@/ts/Types'

import { apiPaths as API_PATHS } from '@openclaw/shared'
import { client } from '@/lib/api/client'
import buildAdminPaginatedQuery from '@/lib/api/buildAdminPaginatedQuery'

const admin = {
    getAdminStats: () => client.get<AdminStats>(API_PATHS.ADMIN.STATS),
    getAdminAnalytics: (range: AdminAnalyticsRange) =>
        client.get<AdminAnalyticsResponse>(
            `${API_PATHS.ADMIN.ANALYTICS}?range=${range}`
        ),
    listAdminBilling: async (page: number = 1, limit: number = 20) => {
        const qs = buildAdminPaginatedQuery({ page, limit })
        const res = await client.get<AdminBillingApiResponse>(
            `${API_PATHS.ADMIN.BILLING}?${qs}`
        )
        return { items: res.items, total: res.totalCount, maxPage: res.maxPage }
    },
    getAdminUsers: (
        page: number = 1,
        limit: number = 20,
        search?: string,
        hasClaws?: string,
        sort?: string
    ) =>
        client.get<AdminUsersResponse>(
            `${API_PATHS.ADMIN.USERS}?${buildAdminPaginatedQuery({ page, limit, search, sort, hasClaws })}`
        ),
    getAdminUserDetail: (id: string) =>
        client.get<AdminUserDetail>(API_PATHS.ADMIN.USER(id)),
    updateAdminUser: (id: string, data: UpdateAdminUserData) =>
        client.put<void>(API_PATHS.ADMIN.UPDATE_USER(id), data),
    listAdminClaws: (
        page: number = 1,
        limit: number = 20,
        search?: string,
        sort?: string
    ) =>
        client.get<AdminClawsResponse>(
            `${API_PATHS.ADMIN.CLAWS}?${buildAdminPaginatedQuery({ page, limit, search, sort })}`
        ),
    listAdminSSHKeys: (
        page: number = 1,
        limit: number = 20,
        search?: string,
        sort?: string
    ) =>
        client.get<AdminSSHKeysResponse>(
            `${API_PATHS.ADMIN.SSH_KEYS}?${buildAdminPaginatedQuery({ page, limit, search, sort })}`
        ),
    listAdminVolumes: (page: number = 1, limit: number = 20, sort?: string) =>
        client.get<AdminVolumesResponse>(
            `${API_PATHS.ADMIN.VOLUMES}?${buildAdminPaginatedQuery({ page, limit, sort })}`
        ),
    listAdminPendingClaws: (
        page: number = 1,
        limit: number = 20,
        sort?: string
    ) =>
        client.get<AdminPaginatedResponse<AdminPendingClawListItem>>(
            `${API_PATHS.ADMIN.PENDING_CLAWS}?${buildAdminPaginatedQuery({ page, limit, sort })}`
        ),
    listAdminReferrals: (page: number = 1, limit: number = 20, sort?: string) =>
        client.get<AdminPaginatedResponse<AdminReferralListItem>>(
            `${API_PATHS.ADMIN.REFERRALS}?${buildAdminPaginatedQuery({ page, limit, sort })}`
        ),
    listAdminWaitlist: (
        page: number = 1,
        limit: number = 20,
        search?: string,
        sort?: string
    ) =>
        client.get<AdminPaginatedResponse<AdminWaitlistListItem>>(
            `${API_PATHS.ADMIN.WAITLIST}?${buildAdminPaginatedQuery({ page, limit, search, sort })}`
        ),
    listAdminExports: (page: number = 1, limit: number = 20, sort?: string) =>
        client.get<AdminPaginatedResponse<AdminExportListItem>>(
            `${API_PATHS.ADMIN.EXPORTS}?${buildAdminPaginatedQuery({ page, limit, sort })}`
        ),
    listAdminEmails: (page: number = 1, limit: number = 20, sort?: string) =>
        client.get<AdminPaginatedResponse<AdminEmailListItem>>(
            `${API_PATHS.ADMIN.EMAILS}?${buildAdminPaginatedQuery({ page, limit, sort })}`
        ),
    getAdminSettings: () =>
        client.get<{
            settings: Array<{
                key: string
                value: string | null
                isSecret: boolean
                updatedAt: string
            }>
        }>(API_PATHS.ADMIN.SETTINGS),
    updateAdminSetting: (key: string, value: string | null) =>
        client.put<void>(API_PATHS.ADMIN.UPDATE_SETTING(key), { value }),
    reassignAdminClawOwner: (clawId: string, userId: string) =>
        client.put<{ userId: string; ownerEmail: string | null }>(
            API_PATHS.ADMIN.REASSIGN_CLAW_OWNER(clawId),
            { userId }
        ),
    listAdminActivationCodes: (
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
                planId: string
                provider: string
                tierLabel: string | null
                partnerName: string | null
                batchId: string | null
                notes: string | null
                validityMonths: number | null
                status: string
                redeemedByUserId: string | null
                redeemedClawId: string | null
                redeemedAt: string | null
                expiresAt: string | null
                createdAt: string
                redeemedByEmail: string | null
                redeemedClawName: string | null
            }>
            total: number
            page: number
            totalPages: number
        }>(`${API_PATHS.ADMIN.ACTIVATION_CODES}?${qs.toString()}`)
    },
    createActivationCodeBatch: (data: {
        planId: string
        provider: string
        tierLabel?: string | null
        partnerName?: string | null
        notes?: string | null
        validityMonths?: number | null
        expiresAt?: string | null
        count: number
    }) =>
        client.post<{
            batchId: string
            count: number
            codes: { id: string; code: string }[]
        }>(API_PATHS.ADMIN.ACTIVATION_CODE_BATCHES, data),
    voidActivationCode: (id: string) =>
        client.put<{ id: string; status: string }>(
            API_PATHS.ADMIN.VOID_ACTIVATION_CODE(id),
            {}
        )
}

export default admin