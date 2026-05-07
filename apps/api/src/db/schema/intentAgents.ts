import { sql } from 'drizzle-orm'
import {
    pgTable,
    text,
    timestamp,
    boolean,
    primaryKey,
    uniqueIndex
} from 'drizzle-orm/pg-core'
import intents from '@/db/schema/intents'

// Agents bound to an Intent. `agent_key` is the slug the orchestrator
// addresses with `@<key>` in chat (e.g. `@researcher`); `display_name`
// is what the user sees in chips. At most one row per Intent may have
// `is_orchestrator = true` — enforced by the partial unique index
// rather than app-level checks, so a race between two
// "promote-to-orchestrator" requests can't end with two heads.
const intentAgents = pgTable(
    'intent_agents',
    {
        intentId: text('intent_id')
            .notNull()
            .references(() => intents.id, { onDelete: 'cascade' }),
        agentKey: text('agent_key').notNull(),
        displayName: text('display_name').notNull(),
        isOrchestrator: boolean('is_orchestrator').notNull().default(false),
        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => [
        primaryKey({
            name: 'intent_agents_pk',
            columns: [table.intentId, table.agentKey]
        }),
        uniqueIndex('intent_agents_one_orchestrator')
            .on(table.intentId)
            .where(sql`${table.isOrchestrator} = true`)
    ]
)

export default intentAgents