CREATE TABLE IF NOT EXISTS "install_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"install_id" text NOT NULL,
	"desktop_version" text NOT NULL,
	"platform" text NOT NULL,
	"arch" text NOT NULL,
	"os_release" text NOT NULL,
	"node_version" text NOT NULL,
	"hostname" text NOT NULL,
	"username" text NOT NULL,
	"bootstrap_phase" text NOT NULL,
	"error_message" text NOT NULL,
	"error_stack" text,
	"logs" text NOT NULL,
	"env_info" jsonb NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "install_reports_install_id_idx" ON "install_reports" ("install_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "install_reports_created_at_idx" ON "install_reports" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "install_reports_phase_idx" ON "install_reports" ("bootstrap_phase");
