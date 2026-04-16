import type {
    BillingHistoryResponse,
    BillingInvoiceResponse,
    Claw,
    CustomerPortalResponse,
    Location,
    PlanAvailability,
    PlansResponse,
    PurchaseClawData,
    PurchaseClawResponse,
    SSHKey,
    UpdateProfileData,
    UserProfile,
    UserStats,
    VerifyOtpResponse,
    VolumePricing
} from '@/ts/Interfaces'

import { RequestClient } from '@openclaw/shared'
import { getCachedToken, clearTokenCache } from '@/lib/firebase'

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.myclaw.one'

const client = new RequestClient({
    baseUrl: BASE_URL,
    getHeaders: async (): Promise<Record<string, string>> => {
        const token = await getCachedToken()
        return token ? { Authorization: `Bearer ${token}` } : {}
    },
    onUnauthorized: async (): Promise<void> => {
        clearTokenCache()
        await getCachedToken(true)
    }
})

const publicClient = new RequestClient({
    baseUrl: BASE_URL
})

const api = {
    sendOtp: (email: string): Promise<void> =>
        publicClient.post<void>('/auth/send-otp', { email }),
    verifyOtp: (email: string, code: string): Promise<VerifyOtpResponse> =>
        publicClient.post<VerifyOtpResponse>('/auth/verify-otp', {
            email,
            code
        }),
    getClaws: (): Promise<Claw[]> => client.get<Claw[]>('/claws'),
    getPlans: (provider?: string): Promise<PlansResponse> =>
        client.get<PlansResponse>(
            `/plans${provider ? `?provider=${provider}` : ''}`
        ),
    getProfile: (): Promise<UserProfile> =>
        client.get<UserProfile>('/users/me'),
    updateProfile: (data: UpdateProfileData): Promise<UserProfile> =>
        client.put<UserProfile>('/users/me', data),
    getUserStats: (): Promise<UserStats> =>
        client.get<UserStats>('/users/me/stats'),
    getBillingHistory: (
        page: number = 1,
        limit: number = 10
    ): Promise<BillingHistoryResponse> =>
        client.get<BillingHistoryResponse>(
            `/users/me/billing?page=${page}&limit=${limit}`
        ),
    getOrderInvoice: (orderId: string): Promise<BillingInvoiceResponse> =>
        client.get<BillingInvoiceResponse>(
            `/users/me/billing/${orderId}/invoice`
        ),
    getCustomerPortal: (): Promise<CustomerPortalResponse> =>
        client.post<CustomerPortalResponse>('/users/me/billing/portal'),
    getLocations: (provider?: string): Promise<Location[]> =>
        client.get<Location[]>(
            `/plans/locations${provider ? `?provider=${provider}` : ''}`
        ),
    getVolumePricing: (provider?: string): Promise<VolumePricing> =>
        client.get<VolumePricing>(
            `/plans/volume-pricing${provider ? `?provider=${provider}` : ''}`
        ),
    getPlanAvailability: (provider?: string): Promise<PlanAvailability> =>
        client.get<PlanAvailability>(
            `/plans/availability${provider ? `?provider=${provider}` : ''}`
        ),
    getSSHKeys: (): Promise<SSHKey[]> => client.get<SSHKey[]>('/ssh-keys'),
    purchaseClaw: (data: PurchaseClawData): Promise<PurchaseClawResponse> =>
        client.post<PurchaseClawResponse>('/claws/purchase', data)
}

export default api