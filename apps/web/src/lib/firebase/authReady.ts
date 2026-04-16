import type { User } from 'firebase/auth'

import { onAuthStateChanged } from 'firebase/auth'
import auth from '@/lib/firebase/auth'

let authReadyResolve: (user: User | null) => void

const authReady = new Promise<User | null>((resolve) => {
    authReadyResolve = resolve
})

const unsubscribeInit = onAuthStateChanged(auth, (user) => {
    authReadyResolve(user)
    unsubscribeInit()
})

export default authReady