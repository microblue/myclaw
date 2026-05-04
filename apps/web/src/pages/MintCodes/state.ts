// All wizard state lives in the URL search params. Refreshing or
// deep-linking into a step keeps everything; closing the tab discards
// nothing valuable. Same pattern as /claws/new.

export const KEYS = {
    provider: 'provider',
    planId: 'planId',
    region: 'region',
    count: 'count',
    validity: 'validity',
    partner: 'partner',
    label: 'label',
    expiresAt: 'expiresAt'
} as const

export interface MintState {
    provider: string
    planId: string
    region: string
    count: number
    validityMonths: number | null
    partnerName: string
    tierLabel: string
    expiresAt: string // YYYY-MM-DD or ''
}

export const readState = (search: URLSearchParams): MintState => {
    const validityRaw = search.get(KEYS.validity)
    return {
        provider: search.get(KEYS.provider) || '',
        planId: search.get(KEYS.planId) || '',
        region: search.get(KEYS.region) || '',
        count: Math.max(1, Number(search.get(KEYS.count) || '10')),
        validityMonths:
            validityRaw == null || validityRaw === ''
                ? 12
                : validityRaw === 'perpetual'
                  ? null
                  : Number(validityRaw),
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
    if (patch.provider !== undefined) set(KEYS.provider, patch.provider)
    if (patch.planId !== undefined) set(KEYS.planId, patch.planId)
    if (patch.region !== undefined) set(KEYS.region, patch.region)
    if (patch.count !== undefined) set(KEYS.count, String(patch.count))
    if (patch.validityMonths !== undefined)
        set(
            KEYS.validity,
            patch.validityMonths == null ? 'perpetual' : String(patch.validityMonths)
        )
    if (patch.partnerName !== undefined) set(KEYS.partner, patch.partnerName)
    if (patch.tierLabel !== undefined) set(KEYS.label, patch.tierLabel)
    if (patch.expiresAt !== undefined) set(KEYS.expiresAt, patch.expiresAt)
    return next
}