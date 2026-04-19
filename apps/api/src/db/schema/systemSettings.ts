import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// KV-style admin settings. Used for runtime-editable global config
// the control plane reads when provisioning new claws — e.g. the
// default OpenRouter API key that gets baked into every new claw's
// openclaw.json. Editing the row flips the value for the next
// provision; existing claws keep their originally-baked key until
// re-provisioned.
const systemSettings = pgTable('system_settings', {
    key: text('key').primaryKey(),
    value: text('value'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedBy: text('updated_by')
})

export default systemSettings
