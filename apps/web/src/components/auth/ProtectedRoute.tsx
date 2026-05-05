import type { FC, ReactNode } from 'react'
import type { ProtectedRouteProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { ROUTES } from '@/lib'

const ProtectedRoute: FC<ProtectedRouteProps> = ({ children }): ReactNode => {
    const { user, loading } = useAuth()

    if (loading) return null

    if (!user) return <Navigate to={ROUTES.LOGIN} replace />

    return <Fragment>{children}</Fragment>
}

export default ProtectedRoute