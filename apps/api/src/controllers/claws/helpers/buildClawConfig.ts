import applyToolsDefaults from '@/controllers/claws/helpers/applyToolsDefaults'

// Builds the openclaw.json config that ships with every freshly-provisioned
// claw. Used by both:
//   - generateCloudInit (VM path) — base64s the result into CONFIG_JSON_B64
//     env var inside the cloud-init wrapper.
//   - provisionClawServer (container path) — base64s the result into the
//     CONFIG_JSON_B64 env var passed to the Fly machine.
//
// Pure builder, no I/O — both paths produce identical configs from the
// same inputs.

const buildClawConfig = (
    gatewayToken: string,
    llm?: {
        openrouterApiKey?: string | null
        defaultModel?: string | null
    }
): Record<string, unknown> => {
    const config: Record<string, unknown> = {
        ui: {
            assistant: {
                name: 'Claw',
                avatar: 'https://myclaw.one/myclaw-logo.svg'
            }
        },
        gateway: {
            mode: 'local',
            reload: { mode: 'off' },
            auth: { mode: 'token', token: gatewayToken },
            remote: { token: gatewayToken },
            controlUi: {
                allowInsecureAuth: true,
                allowedOrigins: ['*'],
                dangerouslyDisableDeviceAuth: true
            },
            trustedProxies: ['127.0.0.1', '::1'],
            http: {
                endpoints: {
                    chatCompletions: { enabled: true }
                }
            }
        },
        channels: {
            whatsapp: { dmPolicy: 'open', allowFrom: ['*'], enabled: true },
            telegram: { dmPolicy: 'open', allowFrom: ['*'], enabled: true },
            discord: { enabled: true },
            slack: { enabled: true },
            signal: { dmPolicy: 'open', allowFrom: ['*'], enabled: true }
        },
        commands: { restart: true, bash: true },
        browser: {
            enabled: true,
            executablePath: '/usr/bin/google-chrome-stable',
            headless: true,
            noSandbox: true
        },
        plugins: {
            entries: {
                openrouter: { enabled: true },
                browser: { enabled: true }
            }
        }
    }

    applyToolsDefaults(config)

    const agentsConfig: Record<string, unknown> = {
        defaults: { sandbox: { mode: 'off' } as Record<string, unknown> },
        list: [{ id: 'main', name: 'Claw', default: true }]
    }

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

    config.meta = {
        lastTouchedVersion: '2026.4.11',
        lastTouchedAt: '2026-04-01T00:00:00.000Z'
    }

    return config
}

// 1-space indent matches generateCloudInit's old behaviour — keeps the
// CONFIG_JSON_B64 byte count identical so VM and container paths
// produce the same rendered config.
export const renderClawConfigJsonB64 = (
    config: Record<string, unknown>
): string =>
    Buffer.from(JSON.stringify(config, null, 1), 'utf8').toString('base64')

export default buildClawConfig