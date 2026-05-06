import { pgTable, uuid, text, jsonb, numeric, timestamp } from 'drizzle-orm/pg-core'
import users from '@/db/schema/users'

// One row per registered channel partner. Created by super_admin via
// /admin/partners/new (invite flow). The partner's user_id links back
// to the same `users.id` they sign up with (single-account v1 — no
// partner_member sub-accounts).
//
// Per docs/aios-design.md §15: `status` flips from 'active' to
// 'suspended' (login-blocked, codes still work) or 'terminated'
// (login-blocked, unused codes auto-voided, accrued payouts paused).
const channelPartners = pgTable('channel_partners', {
    userId: uuid('user_id')
        .primaryKey()
        .references(() => users.id, { onDelete: 'restrict' }),
    displayName: text('display_name').notNull(),
    status: text('status').notNull().default('active'),
    // 0..100 share of redeemed-code revenue accrued to the partner.
    // Numeric to avoid float drift on cumulative payout math.
    revenueSharePct: numeric('revenue_share_pct').notNull().default('0'),
    payoutMethod: jsonb('payout_method'),
    createdAt: timestamp('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .defaultNow()
        .notNull()
})

export default channelPartners