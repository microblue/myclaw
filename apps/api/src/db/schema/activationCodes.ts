import { pgTable, text, timestamp, integer, index } from 'drizzle-orm/pg-core'
import users from '@/db/schema/users'

const activationCodes = pgTable(
    'activation_codes',
    {
        id: text('id').primaryKey(),
        code: text('code').notNull().unique(),
        planId: text('plan_id').notNull(),
        provider: text('provider').notNull().default('hetzner'),
        tierLabel: text('tier_label'),
        partnerName: text('partner_name'),
        batchId: text('batch_id'),
        notes: text('notes'),
        validityMonths: integer('validity_months'),
        status: text('status').notNull().default('unused'),
        redeemedByUserId: text('redeemed_by_user_id').references(
            () => users.id,
            { onDelete: 'set null' }
        ),
        redeemedClawId: text('redeemed_claw_id'),
        redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
        expiresAt: timestamp('expires_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull(),
        createdByUserId: text('created_by_user_id').references(() => users.id, {
            onDelete: 'set null'
        })
    },
    (table) => [
        index('activation_codes_status_idx').on(table.status),
        index('activation_codes_partner_idx').on(table.partnerName),
        index('activation_codes_batch_idx').on(table.batchId)
    ]
)

export default activationCodes