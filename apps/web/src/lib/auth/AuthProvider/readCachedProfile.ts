import type { CachedProfile } from '@/ts/Interfaces'

const PROFILE_CACHE_KEY = 'myclaw.profile'

const readCachedProfile = (): CachedProfile | null => {
    try {
        const raw = localStorage.getItem(PROFILE_CACHE_KEY)
        return raw ? JSON.parse(raw) : null
    } catch {
        return null
    }
}

export { PROFILE_CACHE_KEY }
export default readCachedProfile
