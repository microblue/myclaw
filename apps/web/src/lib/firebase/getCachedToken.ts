import auth from '@/lib/firebase/auth'
import authReady from '@/lib/firebase/authReady'
import tokenState from '@/lib/firebase/tokenState'

const getCachedToken = async (
    forceRefresh?: boolean
): Promise<string | null> => {
    if (
        !forceRefresh &&
        tokenState.cachedToken &&
        Date.now() < tokenState.tokenExpiry
    ) {
        return tokenState.cachedToken
    }

    if (!auth.currentUser) {
        const user = await authReady
        if (!user) return null
    }

    const currentUser = auth.currentUser
    if (!currentUser) return null

    tokenState.cachedToken = await currentUser.getIdToken(forceRefresh)
    tokenState.tokenExpiry = Date.now() + 3300 * 1000
    return tokenState.cachedToken
}

export default getCachedToken