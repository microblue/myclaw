import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { systemSettings } from '@/db/schema'

// Short-lived in-memory cache. Settings are read on every claw
// provision, but the table itself is tiny and changes rarely. 30s
// strikes a balance between "admin hits Save and the next claw uses
// the new value" and "don't round-trip to Postgres per request".
const CACHE_TTL_MS = 30_000
const cache = new Map<string, { value: string | null; expires: number }>()

export const getSystemSetting = async (
    key: string
): Promise<string | null> => {
    const cached = cache.get(key)
    if (cached && cached.expires > Date.now()) return cached.value
    const [row] = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, key))
        .limit(1)
    const value = row?.value ?? null
    cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS })
    return value
}

export const setSystemSetting = async (
    key: string,
    value: string | null,
    updatedBy?: string
): Promise<void> => {
    await db
        .insert(systemSettings)
        .values({ key, value, updatedBy })
        .onConflictDoUpdate({
            target: systemSettings.key,
            set: { value, updatedBy, updatedAt: new Date() }
        })
    cache.delete(key)
}

export const listSystemSettings = async (): Promise<
    Array<{ key: string; value: string | null; updatedAt: Date }>
> => {
    const rows = await db.select().from(systemSettings)
    return rows.map((r) => ({
        key: r.key,
        value: r.value,
        updatedAt: r.updatedAt
    }))
}

// Keys treated as secret — responses mask all but the last 4 chars.
const SECRET_KEY_PATTERNS = [/api_key/i, /secret/i, /token/i, /password/i]

export const isSecretKey = (key: string): boolean =>
    SECRET_KEY_PATTERNS.some((p) => p.test(key))

export const maskSecret = (value: string | null): string | null => {
    if (!value) return value
    if (value.length <= 8) return '•'.repeat(value.length)
    return value.slice(0, 6) + '…' + value.slice(-4)
}

// Well-known keys so callers don't stringly-type them everywhere.
export const SETTINGS_KEYS = {
    defaultOpenrouterApiKey: 'default_openrouter_api_key',
    defaultOpenrouterModel: 'default_openrouter_model'
} as const