import { pgTable, uuid, text, timestamp, integer, index } from 'drizzle-orm/pg-core'
import users from '@/db/schema/users'

const activationCodes = pgTable(
    'activation_codes',
    {
        id: text('id').primaryKey(),
        code: text('code').notNull().unique(),
        // Carried only for `sku_kind = 'new'`. Renewal codes are
        // plan/provider/region-agnostic — they extend whichever claw
        // the user picks at redeem time.
        planId: text('plan_id'),
        provider: text('provider').default('hetzner'),
        region: text('region'),
        tierLabel: text('tier_label'),
        // Free-text legacy label; preserved for pre-RBAC batches.
        // For new batches minted by a registered channel partner,
        // `partnerId` (FK below) is the source of truth and partnerName
        // mirrors channel_partners.display_name at mint time.
        partnerName: text('partner_name'),
        partnerId: uuid('partner_id').references(() => users.id, {
            onDelete: 'set null'
        }),
        batchId: text('batch_id'),
        notes: text('notes'),
        // Days, not months. Matches the white paper's xxxxxxxxx-ddd-uuu
        // format (007 / 090 / 180 / 365). Null = perpetual / credit-coded.
        validityDays: integer('validity_days'),
        // Container-tier SKUs are credit-based (Fly bills by seconds, so
        // a flat day-validity mismatches actual cost). Mutually exclusive
        // with validity_days at the row level — enforced in code, not by
        // a CHECK constraint, since both being null is also a legal state
        // for legacy rows minted before §4.5 landed.
        creditUsd: integer('credit_usd'),
        // 'new' creates a fresh claw. 'renewal' extends an existing one.
        skuKind: text('sku_kind').notNull().default('new'),
        // Multi-device packs: 5/25/50 seats per code. Each redemption
        // consumes one seat (see activationSeats); the code itself flips
        // to status='redeemed' only when seatsUsed == seats.
        seats: integer('seats').notNull().default(1),
        seatsUsed: integer('seats_used').notNull().default(0),
        status: text('status').notNull().default('unused'),
        // Last-seat redemption details kept for backward compat / quick
        // lookups; per-seat history lives in activation_seats.
        redeemedByUserId: uuid('redeemed_by_user_id').references(
            () => users.id,
            { onDelete: 'set null' }
        ),
        redeemedClawId: text('redeemed_claw_id'),
        redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
        expiresAt: timestamp('expires_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull(),
        createdByUserId: uuid('created_by_user_id').references(() => users.id, {
            onDelete: 'set null'
        })
    },
    (table) => [
        index('activation_codes_status_idx').on(table.status),
        index('activation_codes_partner_idx').on(table.partnerName),
        index('activation_codes_partner_id_idx').on(table.partnerId),
        index('activation_codes_batch_idx').on(table.batchId),
        index('activation_codes_sku_kind_idx').on(table.skuKind)
    ]
)

export default activationCodes