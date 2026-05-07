import applyToolsDefaults from '@/controllers/claws/helpers/applyToolsDefaults'

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
    const config: Record<string, unknown> = {
        // Control UI chrome + status contexts read ui.assistant for the
        // chat header avatar + display name. Set these explicitly so the
        // customer sees "Claw" with the myclaw logo instead of OpenClaw's
        // default placeholder. The URL must be a real static asset —
        // `/logo.png` resolves to the SPA index.html (text/html) and
        // makes the <img> 404-render as a broken icon.
        ui: {
            assistant: {
                name: 'Claw',
                avatar: 'https://myclaw.one/myclaw-logo.svg'
            }
        },
        gateway: {
            mode: 'local',
            // Disable openclaw's config-watcher reload pipeline. openclaw
            // periodically rewrites its own config (every config write
            // re-stamps `meta.lastTouchedAt` via stampConfigVersion in
            // io-*.js) but the watcher does not de-dup self-writes, so
            // every internal write hits matchRule(), falls through with
            // no rule for `meta.*`, and sets restartGateway=true — a
            // 12-min self-restart loop on a fresh claw, with each cycle
            // re-running plugin runtime-deps install and saturating the
            // event loop for ~30-60s. With mode=off the watcher's
            // dispatch returns early before queueRestart, so internal
            // writes (admin UI key rotations, channel health state, etc.)
            // simply persist without bouncing the process. Trade-off:
            // admin-ui-driven config changes need a manual restart to
            // take effect — acceptable for our deployment shape.
            // ma4mzhe7 incident 2026-04-30 — see config-reload-*.js,
            // BASE_RELOAD_RULES has no entry for `meta`.
            reload: { mode: 'off' },
            auth: {
                mode: 'token',
                token: gatewayToken
            },
            remote: {
                token: gatewayToken
            },
            controlUi: {
                allowInsecureAuth: true,
                allowedOrigins: ['*'],
                dangerouslyDisableDeviceAuth: true
            },
            trustedProxies: ['127.0.0.1', '::1'],
            // Open WebUI is wired in as the default chat UI for OpenClaw
            // claws (replaces the stock Control UI). It speaks generic
            // OpenAI to OpenClaw's gateway, and that endpoint is OFF by
            // default — flip it on so /v1/models + /v1/chat/completions
            // become reachable. Verified live on cosmic-dune 2026-04-22.
            http: {
                endpoints: {
                    chatCompletions: { enabled: true }
                }
            }
        },
        channels: {
            // Channels ship enabled. openclaw's Control UI hides any
            // channel with `enabled: false` from the channels tab — so
            // disabling them by default removes them from the list and
            // users can't even see them to configure credentials. The
            // 8s/15min health-monitor restart spike that v1.16 tried to
            // suppress was a cosmetic event-loop blip with no chat
            // impact, so visibility wins (v1.16 reverted in v1.17,
            // ma4mzhe7 UX incident 2026-05-01).
            whatsapp: { dmPolicy: 'open', allowFrom: ['*'], enabled: true },
            telegram: { dmPolicy: 'open', allowFrom: ['*'], enabled: true },
            discord: { enabled: true },
            slack: { enabled: true },
            signal: { dmPolicy: 'open', allowFrom: ['*'], enabled: true }
        },
        commands: {
            restart: true,
            bash: true
        },
        browser: {
            enabled: true,
            executablePath: '/usr/bin/google-chrome-stable',
            headless: true,
            noSandbox: true
        },
        // Same rationale as the channel `enabled` flags — without
        // these pre-populated, the first-boot normalizer fills them
        // in and rewrites, triggering a restart. We list every plugin
        // our config actually uses.
        plugins: {
            entries: {
                openrouter: { enabled: true },
                browser: { enabled: true }
            }
        }
    }

    applyToolsDefaults(config)
    // Pre-declare a `main` agent in the config. Without this, openclaw
    // returns an empty `agents.list[]` and the studio UI shows "No
    // agents available" — the user has to click "New Agent" before
    // they can chat. Per the user's "open and use" requirement, we
    // ship one out-of-the-box agent so the chat is usable on first
    // load. The on-disk agent files (IDENTITY.md / AGENTS.md / SOUL.md)
    // are seeded by install-claw.sh under
    // /home/openclaw/.openclaw/agents/main/agent/, which is what
    // `agents.files.get` reads.
    const agentsConfig: Record<string, unknown> = {
        defaults: { sandbox: { mode: 'off' } as Record<string, unknown> },
        list: [
            {
                id: 'main',
                name: 'Claw',
                default: true
            }
        ]
    }

    // Wire the platform-default LLM so the Control UI lands with a
    // working model on first open. Admin can rotate the key or default
    // model via /admin/settings; each new claw picks up the live values
    // at provision time.
    //
    // Shape mirrors what `openclaw onboard` writes when the user picks
    // OpenRouter. OpenRouter is a built-in extension
    // (enabledByDefault=true), so we don't configure a custom
    // `models.providers.openrouter` block — the extension picks up the
    // API key from the gateway process env (systemd unit below).
    //
    // Model refs must be provider-qualified (`openrouter/<slug>`); a
    // bare ref like `deepseek/deepseek-v3.2` is parsed as
    // provider=deepseek by the runtime and fails with "Unknown model".
    // Auto-prefix when the admin's saved value is a bare slug.
    const modelRef = llm?.openrouterApiKey
        ? (() => {
              const raw = llm.defaultModel?.trim() || 'auto'
              return raw.startsWith('openrouter/') ? raw : `openrouter/${raw}`
          })()
        : null

    if (modelRef) {
        ;(agentsConfig.defaults as Record<string, unknown>).model = {
            primary: modelRef
        }
        ;(agentsConfig.defaults as Record<string, unknown>).models = {
            [modelRef]: { alias: 'OpenRouter' }
        }
    }

    config.agents = agentsConfig

    // `meta` block is the third piece that openclaw would otherwise
    // add on first boot (alongside channel.enabled + plugins.entries).
    // Pre-populating it prevents the "missing-meta-before-write"
    // anomaly + the resulting rewrite. `lastTouchedVersion` should
    // match the openclaw version we pin in the install step below
    // so openclaw's own stamping logic sees no drift. `lastTouchedAt`
    // is a fixed pre-installation marker; openclaw rewrites it the
    // first time it touches the config for any other reason (a user
    // config change, a plugin toggle, etc.), which is fine.
    config.meta = {
        lastTouchedVersion: '2026.4.11',
        lastTouchedAt: '2026-04-01T00:00:00.000Z'
    }

    // 1-space indent (vs 2) shaves bytes off the per-claw config JSON,
    // which gets base64-encoded and shipped to the installer as an env
    // var. Tests still pass because non-zero indent keeps the `": "`
    // separator they grep for.
    const configJson = JSON.stringify(config, null, 1)
    // base64 keeps the JSON intact across the env-var → ssh-key →
    // bash-export round trip without us needing to escape every
    // possible metacharacter. The installer decodes back to the file.
    const configJsonB64 = Buffer.from(configJson, 'utf8').toString('base64')

    // Root password is single-quoted in the rendered userData to
    // survive shell metacharacters; escape any embedded single quotes
    // by closing-then-reopening the surrounding quote pair.
    const rootPwEscaped = rootPassword.replace(/'/g, "'\\''")

    // Install-progress reporter env vars; the installer looks for
    // these and POSTs phase markers to /install/:clawId/phase when
    // they're set. Omitted entirely when no install context is given,
    // so legacy callers / tests get an installer with phase reporting
    // silently skipped.
    const installEnv = install
        ? `export IE='https://${domain}/install/${install.clawId}/phase'
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