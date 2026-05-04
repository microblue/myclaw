CREATE TABLE IF NOT EXISTS "activation_codes" (
    "id" text PRIMARY KEY NOT NULL,
    "code" text NOT NULL UNIQUE,
    "plan_id" text NOT NULL,
    "provider" text NOT NULL DEFAULT 'hetzner',
    "tier_label" text,
    "partner_name" text,
    "batch_id" text,
    "notes" text,
    "validity_months" integer,
    "status" text NOT NULL DEFAULT 'unused',
    "redeemed_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
    "redeemed_claw_id" text,
    "redeemed_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "created_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activation_codes_status_idx" ON "activation_codes" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activation_codes_partner_idx" ON "activation_codes" ("partner_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activation_codes_batch_idx" ON "activation_codes" ("batch_id");--> statement-breakpoint
ALTER TABLE "claws" ADD COLUMN IF NOT EXISTS "activation_code_id" text;
