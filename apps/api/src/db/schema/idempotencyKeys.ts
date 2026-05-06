import { pgTable, text, integer, jsonb, timestamp, uuid, index } from 'drizzle-orm/pg-core'
import users from '@/db/schema/users'

// State-mutating endpoints accept an `Idempotency-Key` header (UUID
// minted by the client). Middleware looks up the key:
//   - hit + same body hash  → return cached response
//   - hit + different body  → 422 (key reused with a different request)
//   - miss                  → process + store result
//
// 24h TTL via cron sweep — a longer window doesn't help any real
// retry pattern and bloats the table.
const idempotencyKeys = pgTable(
    'idempotency_keys',
    {
        key: text('key').primaryKey(),
        userId: uuid('user_id').references(() => users.id, {
            onDelete: 'set null'
        }),
        // sha256(method + path + body) — distinguishes "retry of the
        // same request" from "client reused a UUID by accident".
        requestHash: text('request_hash').notNull(),
        statusCode: integer('status_code').notNull(),
        responseBody: jsonb('response_body').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => [
        index('idempotency_keys_created_idx').on(table.createdAt)
    ]
)

export default idempotencyKeys