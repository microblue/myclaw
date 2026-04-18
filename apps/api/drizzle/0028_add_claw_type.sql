ALTER TABLE "claws" ADD COLUMN "claw_type" text NOT NULL DEFAULT 'openclaw';--> statement-breakpoint
ALTER TABLE "pending_claws" ADD COLUMN "claw_type" text NOT NULL DEFAULT 'openclaw';
