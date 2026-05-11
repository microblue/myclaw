import buildClawConfig, {
    renderClawConfigJsonB64
} from '@/controllers/claws/helpers/buildClawConfig'

// Emits a plain bash script, not a #cloud-config YAML. Lightsail
// prepends its own shell preamble to user-data (SSH CA registration
// etc.), which makes cloud-init treat the whole thing as a shell
// script and a YAML-formatted file explodes at the first `ssh_pwauth:`
// line ("not found" for every directive). Shell works on all three
// providers (Lightsail / Hetzner / DigitalOcean) even with an injected
// preamble, so this is the portable path.

const generateCloudInit = (
    rootPassword: string,
    subdomain: string,
    domain: string,
    gatewayToken: string,
    llm?: { openrouterApiKey?: string | null; defaultModel?: string | null },
    install?: {
        clawId: string
        installRunId: string
        centralToken: string
    }
): string => {
    const config = buildClawConfig(gatewayToken, llm)
    const configJsonB64 = renderClawConfigJsonB64(config)

    // Root password is single-quoted in the rendered userData to
    // survive shell metacharacters; escape any embedded single quotes
    // by closing-then-reopening the surrounding quote pair.
    const rootPwEscaped = rootPassword.replace(/'/g, "'\\''")

    // IE points to the install-phase POST endpoint. The API is
    // reverse-proxied at /api/* in production (nginx in front of the
    // Hono server), so the URL must include the /api prefix —
    // without it nginx serves the SPA route and returns 405 on POST,
    // which the installer's `|| true` silently swallowed. Result was
    // every claw stuck at `renting_compute` because no phase past
    // that ever made it back to the DB.
    const installEnv = install
        ? `export IE='https://${domain}/api/install/${install.clawId}/phase'
export IT='${install.centralToken}'
export IR='${install.installRunId}'`
        : ''
    const llmEnv = llm?.openrouterApiKey
        ? `export OPENROUTER_API_KEY='${llm.openrouterApiKey.replace(/'/g, "'\\''")}'`
        : ''
    // P2a: this used to be a 480-line inline bash script. The bulk
    // moved to apps/api/cloud-scripts/install-claw.sh, served as
    // /api/cloud-scripts/install-claw. cloud-init's userData now
    // exports the per-claw env vars and curl|bash's the installer,
    // shrinking the rendered userData from ~12 KB raw to ~1.5 KB raw
    // — well under Lightsail's 16 KB-base64 cap — and letting us
    // iterate on the installer without re-rendering every claw's
    // userData.
    const script = `#!/bin/bash
[ -z "\${BASH_VERSION:-}" ] && exec /bin/bash "$0" "$@"
set -eu
export ROOT_PASSWORD='${rootPwEscaped}'
export SUBDOMAIN='${subdomain}'
export DOMAIN='${domain}'
export GATEWAY_TOKEN='${gatewayToken}'
export CONFIG_JSON_B64='${configJsonB64}'
${llmEnv}
${installEnv}
curl -fsSL "https://${domain}/api/cloud-scripts/install-claw" | bash
`
    return script
}

export default generateCloudInit