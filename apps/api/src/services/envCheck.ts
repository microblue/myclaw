// Boot-time validation of critical env vars. Runs before the server
// starts accepting traffic — if a secret is unset, a placeholder, or
// shaped wrong, we crash fast with a clear log line and let systemd
// decide whether to retry.
//
// Why: prod ran for weeks with CLOUDFLARE_API_TOKEN="your-cloudflare-api-token"
// and no one noticed because every CF write path caught and swallowed
// the resulting 400. Claws got stuck in `configuring` with NXDOMAIN.
// An unrecoverable boot-time failure is the correct signal for
// "you're not actually deployable" — silent runtime failures hide it.

interface EnvRule {
    key: string
    // Regex that the real value must match. Format checks — cheap and
    // catches "I copied the example file but didn't edit it".
    shape?: RegExp
    // Extra text included in the error message to point the operator
    // at where the value lives.
    hint?: string
    // If true, a missing value is fine (optional integration). The
    // placeholder / shape checks still run when a value is provided.
    optional?: boolean
}

const PLACEHOLDER_PATTERNS: RegExp[] = [
    /^your[-_]/i, // "your-token", "your_key"
    /placeholder/i,
    /replace[-_]?me/i,
    /^changeme$/i,
    /^xxx+$/i,
    /^<.+>$/ // "<paste-here>"
]

const isPlaceholder = (value: string): boolean =>
    PLACEHOLDER_PATTERNS.some((p) => p.test(value.trim()))

const RULES: EnvRule[] = [
    {
        key: 'DATABASE_URL',
        shape: /^postgres(ql)?:\/\//,
        hint: 'postgres://user:pw@host:port/db'
    },
    {
        key: 'FIREBASE_PROJECT_ID',
        hint: 'Firebase Console → Project settings → Project ID'
    },
    {
        key: 'FIREBASE_CLIENT_EMAIL',
        shape: /@.+\.iam\.gserviceaccount\.com$/,
        hint: 'service-account email from the Firebase Admin SDK JSON'
    },
    {
        key: 'FIREBASE_PRIVATE_KEY',
        shape: /BEGIN PRIVATE KEY/,
        hint: 'full PEM block including -----BEGIN PRIVATE KEY-----'
    },
    {
        key: 'CLOUDFLARE_API_TOKEN',
        shape: /^.{30,}$/,
        hint: 'Cloudflare → My Profile → API Tokens (Zone:DNS:Edit scope)'
    },
    {
        key: 'CLOUDFLARE_ZONE_ID',
        shape: /^[a-f0-9]{32}$/,
        hint: 'Cloudflare zone page → Overview → API (right sidebar)'
    },
    {
        key: 'AWS_ACCESS_KEY_ID',
        shape: /^AKIA[A-Z0-9]{16}$/,
        hint: 'AWS IAM user with Lightsail policy'
    },
    { key: 'AWS_SECRET_ACCESS_KEY', shape: /^.{30,}$/ },
    { key: 'AWS_REGION' },
    // Optional — Hetzner support isn't enabled on every deploy.
    { key: 'HETZNER_API_TOKEN', shape: /^.{30,}$/, optional: true }
]

const validateEnv = (): void => {
    const errors: string[] = []

    for (const rule of RULES) {
        const raw = process.env[rule.key]
        if (!raw || !raw.trim()) {
            if (!rule.optional) {
                errors.push(`${rule.key} is unset`)
            }
            continue
        }
        if (isPlaceholder(raw)) {
            errors.push(
                `${rule.key} looks like a placeholder: "${raw.slice(0, 60)}"${rule.hint ? ` — ${rule.hint}` : ''}`
            )
            continue
        }
        if (rule.shape && !rule.shape.test(raw)) {
            errors.push(
                `${rule.key} doesn't match the expected shape${rule.hint ? ` (${rule.hint})` : ''}`
            )
        }
    }

    if (errors.length) {
        process.stderr.write(
            '\n\x1b[31m❌ Environment validation failed — refusing to start:\x1b[0m\n' +
                errors.map((e) => `  - ${e}`).join('\n') +
                '\n\nFix the above in apps/api/.env (or the systemd unit env) and restart.\n\n'
        )
        process.exit(1)
    }
}

export { validateEnv, isPlaceholder }
export default validateEnv