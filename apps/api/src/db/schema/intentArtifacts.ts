import {
    pgTable,
    text,
    timestamp,
    bigint,
    index
} from 'drizzle-orm/pg-core'
import intents from '@/db/schema/intents'

// Pointers to artifacts that agents produced (files on the claw's
// filesystem). The bytes themselves never live centrally — `pointer`
// is an opaque path-on-claw the SPA hands back to the claw to fetch.
// `sha256` is reported by the claw at create-time; central can re-
// verify on download by comparing against the claw's response, then
// stamp `verified_at`. `size_bytes` is for list-view display only,
// not for security checks.
const intentArtifacts = pgTable(
    'intent_artifacts',
    {
        id: text('id').primaryKey(),
        intentId: text('intent_id')
            .notNull()
            .references(() => intents.id, { onDelete: 'cascade' }),
        kind: text('kind').notNull(),
        name: text('name').notNull(),
        pointer: text('pointer').notNull(),
        sizeBytes: bigint('size_bytes', { mode: 'number' }),
        sha256: text('sha256'),
        verifiedAt: timestamp('verified_at', { withTimezone: true }),
        createdByAgent: text('created_by_agent'),
        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => [
        index('intent_artifacts_intent_idx').on(table.intentId)
    ]
)

export default intentArtifacts