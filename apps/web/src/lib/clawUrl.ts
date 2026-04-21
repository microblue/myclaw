import type { Claw } from '@/ts/Interfaces'

// How we open a claw's on-box UI from the dashboard.
//
// Different claw runtimes expose their Control UI at the same public
// URL (https://<sub>.myclaw.one/) because nginx proxies `/` to
// whichever loopback service the cloud-init brought up:
//   openclaw → port 18789 (gateway + control UI, accepts ?token= for
//     auto-auth)
//   picoclaw → port 18800 (picoclaw-launcher WebUI, has its own
//     onboarding / no shared token scheme)
//
// Keep the branching in one place so new claw types can register
// their quirks here instead of scattering claw_type === '...'
// checks through the dashboard.

export const buildClawChatUrl = (claw: Claw): string | null => {
    if (!claw.subdomain) return null
    const base = `https://${claw.subdomain}.myclaw.one`
    const clawType = claw.clawType || 'openclaw'
    if (clawType === 'openclaw' && claw.gatewayToken) {
        return `${base}/?token=${encodeURIComponent(claw.gatewayToken)}`
    }
    if (clawType === 'picoclaw' && claw.gatewayToken) {
        // /sso is a tiny HTML page nginx serves on the picoclaw box —
        // it POSTs the token to /api/auth/login (sets the auth cookie)
        // and then redirects to /, dropping the user straight into
        // the launcher UI authenticated.
        return `${base}/sso?token=${encodeURIComponent(claw.gatewayToken)}`
    }
    return `${base}/`
}

export const chatEntryHint = (_claw: Claw): string => {
    return 'Click "Open chat" above to log in automatically.'
}