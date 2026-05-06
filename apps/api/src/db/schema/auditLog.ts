import { pgTable, text, jsonb, timestamp, uuid, index } from 'drizzle-orm/pg-core'
import users from '@/db/schema/users'

// Append-only audit trail of consequential admin / partner actions.
// Mandatory writes per docs/aios-design.md §16:
//   - role_change                  (super_admin)
//   - partner_create / suspend /    (super_admin)
//     terminate
//   - partner_quota_grant           (super_admin)
//   - claw_dev_access               (super_admin opens any claw's dev mode)
//   - code_void / batch_void        (super_admin or partner)
//   - token_rotate                  (super_admin)
//   - payout_issued                 (super_admin)
//
// `actor_role` is snapshotted at action time so promote/demote of the
// actor doesn't rewrite history.
const auditLog = pgTable(
    'audit_log',
    {
        id: text('id').primaryKey(),
        actorId: uuid('actor_id')
            .notNull()
            .references(() => users.id, { onDelete: 'restrict' }),
        actorRole: text('actor_role').notNull(),
        action: text('action').notNull(),
        targetKind: text('target_kind'),
        targetId: text('target_id'),
        beforeValue: jsonb('before_value'),
        afterValue: jsonb('after_value'),
        // IP, user-agent, request-id — anything useful for forensics.
        metadata: jsonb('metadata'),
        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => [
        index('audit_log_actor_idx').on(table.actorId, table.createdAt),
        index('audit_log_target_idx').on(table.targetKind, table.targetId, table.createdAt),
        index('audit_log_action_idx').on(table.action, table.createdAt)
    ]
)

export default auditLog