import { pgTable, text, uuid, timestamp, index } from 'drizzle-orm/pg-core'
import claws from '@/db/schema/claws'
import users from '@/db/schema/users'

// Intents are the user's long-running goals/projects — the top-level
// abstraction inside an AI-OS. Per docs/aios-design.md §4.2, only the
// *metadata* lives centrally; outline + messages + artifacts stay on
// the AI-OS itself and are fetched on demand by the web SPA. The
// `last_message_preview` column is a write-only-by-claw snapshot the
// claw pushes after each turn, so the /aios list view can render
// without a round-trip into every claw.
//
// Crucially we do NOT store an outline column — outline is computed
// from local message logs on the claw (single source of truth).
// Earlier draft had `outline jsonb` here; removed because central +
// claw outline drift creates split-brain that no migration can fix.
const intents = pgTable(
    'intents',
    {
        id: text('id').primaryKey(),
        clawId: text('claw_id')
            .notNull()
            .references(() => claws.id, { onDelete: 'cascade' }),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        title: text('title').notNull(),
        // Snapshot of the last message in the Intent's main thread.
        // Pushed by the claw after each turn; never written by the SPA.
        lastMessagePreview: text('last_message_preview'),
        lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
        archivedAt: timestamp('archived_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => [
        index('intents_claw_user_idx').on(table.clawId, table.userId)
    ]
)

export default intents