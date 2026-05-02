import type { Claw } from '@/ts/Interfaces'

// How we open a claw's on-box UI from the dashboard.
//
// Different claw runtimes expose their Control UI at the same public
// URL (https://<sub>.myclaw.one/) because Caddy proxies `/` to
// whichever loopback service the cloud-init brought up:
//   openclaw → port 18789 (gateway + Control UI, accepts #token= for
//     auto-auth without leaking the secret to server logs / referer
//     headers — Caddy's root path now 302-redirects to /myclaw/, so
//     this URL goes straight to /index.html which the gateway also
//     serves the Control UI HTML on)
//   openclaw + Easy Setup wizard → /myclaw/ on the same box (since
//     v1.18). Wizard reads `#t=<token>` from the hash and stores it
//     in sessionStorage for its bearer-auth fetches.
//   picoclaw → port 18800 (picoclaw-launcher WebUI)
//
// Keep the branching in one place so new claw types can register
// their quirks here instead of scattering claw_type === '...'
// checks through the dashboard.

export const buildClawChatUrl = (claw: Claw): string | null => {
    if (!claw.subdomain) return null
    const base = `https://${claw.subdomain}.myclaw.one`
    const clawType = claw.clawType || 'openclaw'
    if (clawType === 'openclaw' && claw.gatewayToken) {
        // /index.html bypasses Caddy's `/` → `/myclaw/` 302 (the
        // wizard now lives at the root) and lands directly on the
        // Control UI HTML the gateway serves. Token in the URL hash
        // (not query) so it stays out of HTTP logs and referer
        // headers.
        return `${base}/index.html#token=${encodeURIComponent(claw.gatewayToken)}`
    }
    if (clawType === 'picoclaw' && claw.gatewayToken) {
        // /sso is a tiny HTML page Caddy serves on the picoclaw box —
        // it POSTs the gateway token to /api/auth/login as the password
        // (sets the auth cookie) and then redirects to /, dropping the
        // user straight into the launcher UI authenticated.
        return `${base}/sso?token=${encodeURIComponent(claw.gatewayToken)}`
    }
    return `${base}/`
}

// Tokenized URL for the Easy Setup wizard at /myclaw/. The wizard's
// SPA captures `#t=<token>` into sessionStorage and uses it as the
// Bearer header on every API call to the localhost shim. Only
// applicable for openclaw claws — picoclaw / others have their own
// onboarding.
export const buildClawWizardUrl = (claw: Claw): string | null => {
    if (!claw.subdomain) return null
    const clawType = claw.clawType || 'openclaw'
    if (clawType !== 'openclaw' || !claw.gatewayToken) return null
    return `https://${claw.subdomain}.myclaw.one/myclaw/#t=${encodeURIComponent(claw.gatewayToken)}`
}

export const chatEntryHint = (_claw: Claw): string => {
    return 'Click "Open chat" above to log in automatically.'
}