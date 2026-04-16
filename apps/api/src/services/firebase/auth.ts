import type { Auth } from 'firebase-admin/auth'

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

let _auth: Auth

const auth = () => {
    if (!_auth) {
        if (!getApps().length) {
            initializeApp({
                credential: cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(
                        /\\n/g,
                        '\n'
                    )
                })
            })
        }
        _auth = getAuth()
    }
    return _auth
}

export default auth