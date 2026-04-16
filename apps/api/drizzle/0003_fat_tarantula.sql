CREATE TABLE IF NOT EXISTS "volumes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"instance_id" text,
	"name" text NOT NULL,
	"size" integer NOT NULL,
	"hetzner_volume_id" integer,
	"location" text NOT NULL,
	"status" text DEFAULT 'creating' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "volumes" ADD CONSTRAINT "volumes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "volumes" ADD CONSTRAINT "volumes_instance_id_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instances"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
