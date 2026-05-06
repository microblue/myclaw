import { pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core'
import users from '@/db/schema/users'
import activationCodes from '@/db/schema/activationCodes'

// One row per redeemed seat of a multi-device activation code. Each
// seat carries its own subscription window — the white paper says the
// clock starts on first activation per seat, not on code generation.
//
// For `sku_kind = 'new'`, the seat row is created at the same time as
// the new claw and `clawId` points at it. For `sku_kind = 'renewal'`,
// the seat row records which existing claw was extended.
//
// `expiresAt` here mirrors the underlying `claws.deletionScheduledAt`,
// kept denormalized for partner reports / receipts where we want to
// answer "when does this seat run out?" without joining claws.
const activationSeats = pgTable(
    'activation_seats',
    {
        id: text('id').primaryKey(),
        activationCodeId: text('activation_code_id')
            .notNull()
            .references(() => activationCodes.id, { onDelete: 'cascade' }),
        redeemedByUserId: uuid('redeemed_by_user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'set null' }),
        clawId: text('claw_id'),
        redeemedAt: timestamp('redeemed_at', { withTimezone: true })
            .defaultNow()
            .notNull(),
        expiresAt: timestamp('expires_at', { withTimezone: true })
    },
    (table) => [
        index('activation_seats_code_idx').on(table.activationCodeId),
        index('activation_seats_user_idx').on(table.redeemedByUserId),
        index('activation_seats_claw_idx').on(table.clawId)
    ]
)

export default activationSeats