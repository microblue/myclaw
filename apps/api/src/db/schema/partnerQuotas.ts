import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core'
import channelPartners from '@/db/schema/channelPartners'

// Per-SKU quota for a channel partner. A single partner can carry
// independent buckets like "100 90-day VM seats" + "50 365-day VM
// seats" + "200 $5 container credits" — single int per partner doesn't
// scale, so we shard by sku_kind + (validityDays | creditUsd).
//
// `sku_kind` values per docs/aios-design.md §4.5:
//   'new_vm_day'           — VM new-claw, day-validity (validityDays set)
//   'renewal_vm_day'       — VM renewal, day-validity
//   'new_container_credit' — container new-claw, $-credit (creditUsd set)
//
// Composite primary key prevents duplicate buckets for the same
// partner+SKU+lifetime combination.
const partnerQuotas = pgTable('partner_quotas', {
    partnerId: uuid('partner_id')
        .notNull()
        .references(() => channelPartners.userId, { onDelete: 'cascade' }),
    skuKind: text('sku_kind').notNull(),
    validityDays: integer('validity_days'),
    creditUsd: integer('credit_usd'),
    total: integer('total').notNull(),
    used: integer('used').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .defaultNow()
        .notNull()
})

export default partnerQuotas