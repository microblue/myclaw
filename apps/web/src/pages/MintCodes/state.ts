// All wizard state lives in the URL search params. Refreshing or
// deep-linking into a step keeps everything; closing the tab discards
// nothing valuable. Same pattern as /claws/new.

export const KEYS = {
    skuKind: 'kind',
    provider: 'provider',
    planId: 'planId',
    region: 'region',
    count: 'count',
    validity: 'validity',
    seats: 'seats',
    partner: 'partner',
    label: 'label',
    expiresAt: 'expiresAt'
} as const

export interface MintState {
    skuKind: 'new' | 'renewal'
    provider: string
    planId: string
    region: string
    count: number
    validityDays: number
    seats: number
    partnerName: string
    tierLabel: string
    expiresAt: string // YYYY-MM-DD or ''
}

export const ALLOWED_VALIDITY_DAYS = [3, 90, 180, 365] as const
export const ALLOWED_SEATS = [1, 5, 25, 50] as const

export const readState = (search: URLSearchParams): MintState => {
    const validityRaw = search.get(KEYS.validity)
    const seatsRaw = search.get(KEYS.seats)
    const skuKindRaw = search.get(KEYS.skuKind)
    return {
        skuKind: skuKindRaw === 'renewal' ? 'renewal' : 'new',
        provider: search.get(KEYS.provider) || '',
        planId: search.get(KEYS.planId) || '',
        region: search.get(KEYS.region) || '',
        count: Math.max(1, Number(search.get(KEYS.count) || '10')),
        validityDays:
            validityRaw == null || validityRaw === ''
                ? 90
                : Number(validityRaw),
        seats: seatsRaw == null || seatsRaw === '' ? 1 : Number(seatsRaw),
        partnerName: search.get(KEYS.partner) || '',
        tierLabel: search.get(KEYS.label) || '',
        expiresAt: search.get(KEYS.expiresAt) || ''
    }
}

export const writeState = (
    search: URLSearchParams,
    patch: Partial<MintState>
): URLSearchParams => {
    const next = new URLSearchParams(search)
    const set = (key: string, value: string) => {
        if (value) next.set(key, value)
        else next.delete(key)
    }
    if (patch.skuKind !== undefined) set(KEYS.skuKind, patch.skuKind)
    if (patch.provider !== undefined) set(KEYS.provider, patch.provider)
    if (patch.planId !== undefined) set(KEYS.planId, patch.planId)
    if (patch.region !== undefined) set(KEYS.region, patch.region)
    if (patch.count !== undefined) set(KEYS.count, String(patch.count))
    if (patch.validityDays !== undefined)
        set(KEYS.validity, String(patch.validityDays))
    if (patch.seats !== undefined) set(KEYS.seats, String(patch.seats))
    if (patch.partnerName !== undefined) set(KEYS.partner, patch.partnerName)
    if (patch.tierLabel !== undefined) set(KEYS.label, patch.tierLabel)
    if (patch.expiresAt !== undefined) set(KEYS.expiresAt, patch.expiresAt)
    return next
}