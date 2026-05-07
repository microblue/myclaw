import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core'
import claws from '@/db/schema/claws'

// Append-only stream of install-phase markers + log tails uploaded by
// the cloud-init / GitHub installer at each phase boundary. The web
// install page (P2b /aios/install/:clawId) subscribes to rows for the
// current install_run_id via Supabase Realtime to drive the animation
// + tail the dual log panes.
//
// Per docs/aios-design.md §4.3 / §5: the latest row's `phase` is the
// live cursor (no separate `claws.install_phase` column — eliminates
// two-channel races). Filtering by install_run_id isolates a re-install
// from prior failed attempts.
//
// Retention: 90-day TTL via cron sweep (§12.4). Bounded growth.
const clawInstallPhases = pgTable(
    'claw_install_phases',
    {
        id: text('id').primaryKey(),
        clawId: text('claw_id')
            .notNull()
            .references(() => claws.id, { onDelete: 'cascade' }),
        installRunId: text('install_run_id').notNull(),
        // 'renting_compute' | 'mounting_storage' | 'installing_kernel' |
        // 'loading_skills' | 'calibrating_agents' | 'wiring_network' |
        // 'issuing_certificate' | 'pulling_image' (container only) |
        // 'ready' | 'failed'
        phase: text('phase').notNull(),
        // Newline-joined tail of bootstrap log + (later phases) gateway
        // log. Capped to ~200 lines per emit by the installer; the
        // server doesn't enforce a length limit but rejects payloads
        // >1MB at the body parser.
        logChunk: text('log_chunk').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => [
        index('claw_install_phases_run_idx').on(
            table.clawId,
            table.installRunId,
            table.createdAt
        )
    ]
)

export default clawInstallPhases