import type { AuthContextType } from '@/ts/Interfaces'

import { createContext } from 'react'

const AuthContext = createContext<AuthContextType | null>(null)

export default AuthContext