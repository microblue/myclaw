// Strips secrets that the SPA must never see. `rootPassword` is the
// VM root login (rendered as a dot-mask + reveal-on-click in the UI,
// hence the boolean projection). `centralToken` is the outbound bearer
// the claw uses to call back into central — knowing it would let any
// caller forge install/phase pings or future claw → central pushes.
const sanitizeClaw = <T extends Record<string, unknown>>(
    claw: T
): Omit<T, 'rootPassword' | 'centralToken'> & { hasRootPassword: boolean } => {
    const { rootPassword, centralToken: _centralToken, ...safe } = claw as T & {
        rootPassword?: unknown
        centralToken?: unknown
    }
    return {
        ...safe,
        hasRootPassword: !!rootPassword
    } as Omit<T, 'rootPassword' | 'centralToken'> & {
        hasRootPassword: boolean
    }
}

export default sanitizeClaw