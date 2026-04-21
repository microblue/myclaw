// Single source of truth for what a "claw type" is on the server side.
//
// Adding a new claw type (zeroclaw, hermes, nanoclaw, ...) only
// requires writing a new adapter that implements this interface and
// registering it in ./index.ts. Nothing else in provisionClawServer /
// initiateClawPurchase / curated-plans needs to care about the
// specific type — they just look up the runtime by id.

export interface GenerateCloudInitParams {
    rootPassword: string
    subdomain: string
    domain: string
    gatewayToken: string
    llm?: {
        openrouterApiKey?: string | null
        defaultModel?: string | null
    }
}

export interface ClawRuntime {
    // Matches the `claw_type` column in the claws table and the id
    // used in SUPPORTED_CLAW_TYPES / clawTypes.ts in the web app.
    id: string

    // systemd unit that runs the claw's gateway on the provisioned VPS.
    // Used by logs / diagnostics / restart endpoints to target the
    // right service without type-specific conditionals at the call site.
    systemdUnit: string

    // Loopback port the gateway listens on (behind nginx). Different
    // claw types pick different ports — OpenClaw uses 18789, PicoClaw
    // uses 18790. The base nginx config proxies 443 → this port.
    gatewayPort: number

    // Emit the shell script that cloud-init will run on first boot to
    // bring up this claw type. Must produce a base64-encoded length
    // below Lightsail's 16 KB userData cap.
    generateCloudInit: (params: GenerateCloudInitParams) => string

    // Provider-specific curated plan ids, in display order. Each claw
    // type picks the subset of bundles it can actually run on — e.g.
    // PicoClaw fits on Lightsail's 512 MB nano_3_0; OpenClaw needs
    // >= 4 GB so it starts at medium_3_0. Missing provider key →
    // claw type isn't offered on that provider.
    curatedPlanIdsByProvider: Record<string, readonly string[]>

    // Defense-in-depth floor enforced inside the provision pipeline.
    // The wizard already filters plans per-runtime via curated-plans,
    // but a direct API call could try to buy any plan id — we want
    // `initiateClawPurchase` / `provisionClawServer` to reject plans
    // smaller than what this runtime actually boots on. OpenClaw = 4,
    // PicoClaw = 0 (nano is intended). Future runtimes declare their
    // own floor here so the check stays type-aware in one place.
    minMemoryGb: number

    // pollLifecycle stage-2 readiness predicate. `provisionClawServer`
    // probes `https://<sub>.<domain>/` after cloud-init signals; the
    // runtime decides whether the response means "fully up" — OpenClaw
    // demands 200 + a body keyword match (Control UI fingerprint);
    // PicoClaw's launcher answers 302 → /launcher-login when the user
    // isn't signed in, which is still a "launcher is serving" signal.
    // Called with the raw Response status and the text body (empty
    // string when no body was read). Runtimes that don't care can
    // inherit the generic 2xx/3xx-that-isn't-nginx default below.
    isHealthyResponse: (status: number, body: string) => boolean
}

// Shared helper for runtimes whose readiness check just needs to rule
// out the nginx default welcome page and accept any non-5xx response
// from the reverse-proxied service. Re-usable default for future
// lightweight runtimes.
export const defaultIsHealthyResponse = (
    status: number,
    body: string
): boolean => {
    if (status < 200 || status >= 500) return false
    if (body.toLowerCase().includes('welcome to nginx')) return false
    return true
}