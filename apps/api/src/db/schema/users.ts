import { pgTable, uuid, text, timestamp, boolean, index } from 'drizzle-orm/pg-core'
import { userRole } from '@openclaw/shared'

// `users.id` is the same UUID as `auth.users.id` — Supabase manages
// auth.users (email + password + JWT), and this profile row is created
// by the on_auth_user_created trigger. Email lives in auth.users; queries
// that need it JOIN against auth.users.
const users = pgTable(
    'users',
    {
        id: uuid('id').primaryKey(),
        name: text('name'),
        polarCustomerId: text('polar_customer_id'),
        hasLicense: boolean('has_license').notNull().default(false),
        role: text('role').notNull().default(userRole.user),
        referralCode: text('referral_code').unique(),
        referralCodeChanged: boolean('referral_code_changed')
            .notNull()
            .default(false),
        referredBy: uuid('referred_by'),
        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => [
        index('users_polar_customer_id_idx').on(table.polarCustomerId),
        index('users_referred_by_idx').on(table.referredBy)
    ]
)

export default users
