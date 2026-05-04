import { pgSchema, uuid, text, timestamp, alias } from 'drizzle-orm/pg-core'

// Read-only shadow of Supabase's `auth.users` table — used only for
// JOINing against public.users to surface email in admin queries. We
// never INSERT/UPDATE this; Supabase Auth owns it. Only the columns
// drizzle queries reference are listed.
//
// We export an aliased version because `public.users` and `auth.users`
// share the same final identifier ("users"), and Postgres rejects
// queries that JOIN both with "table reference \"users\" is ambiguous"
// (error 42P09). Using a distinct alias side-steps the conflict.
const authSchema = pgSchema('auth')

const authUsersTable = authSchema.table('users', {
    id: uuid('id').primaryKey(),
    email: text('email'),
    createdAt: timestamp('created_at', { withTimezone: true })
})

const authUsers = alias(authUsersTable, 'auth_users')

export default authUsers
