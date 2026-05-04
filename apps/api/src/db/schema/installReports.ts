import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core'

// Crash/error reports posted by the MyClaw.One Desktop installer when
// bootstrap (openclaw install + gateway start + studio launch) fails on a
// user's machine. Submitted unauthenticated — the user typically hasn't
// paired yet when the install fails. Rate-limited per IP to prevent abuse.
//
// Privacy: installId is an anonymous UUID minted on first launch and stored
// under userData/install-id. We deliberately collect hostname + username so
// we can identify which machine reported, but no app data, file contents, or
// auth tokens leave the user's machine.
const installReports = pgTable(
    'install_reports',
    {
        id: text('id').primaryKey(),
        // Stable per-install UUID written to userData/install-id.txt. Lets us
        // group repeated reports from the same machine.
        installId: text('install_id').notNull(),
        desktopVersion: text('desktop_version').notNull(),
        platform: text('platform').notNull(),
        arch: text('arch').notNull(),
        // os.release() — e.g. "10.0.26100" on Win, "6.12.10-76061203" on Linux.
        osRelease: text('os_release').notNull(),
        // node version reported by the bundled or system node that ran the
        // bootstrap (e.g. "v24.15.0").
        nodeVersion: text('node_version').notNull(),
        // os.hostname() + os.userInfo().username — for "which machine is this".
        hostname: text('hostname').notNull(),
        username: text('username').notNull(),
        // Bootstrap phase where the failure occurred (idle/detecting/preparing/
        // installing/starting-gateway/ready/error). Useful for grouping similar
        // failures.
        bootstrapPhase: text('bootstrap_phase').notNull(),
        errorMessage: text('error_message').notNull(),
        errorStack: text('error_stack'),
        // Tail of the install log (last ~500 lines), joined with \n.
        logs: text('logs').notNull(),
        // Flexible bag for additional environment fields we haven't promoted to
        // dedicated columns yet (locale, totalMem, npmVersion, electronVersion,
        // etc.). JSONB so we can query individual keys later.
        envInfo: jsonb('env_info').notNull(),
        // Server-side captured fields.
        ip: text('ip'),
        userAgent: text('user_agent'),
        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => [
        index('install_reports_install_id_idx').on(table.installId),
        index('install_reports_created_at_idx').on(table.createdAt),
        index('install_reports_phase_idx').on(table.bootstrapPhase)
    ]
)

export default installReports