DROP TABLE "plans" CASCADE;--> statement-breakpoint
ALTER TABLE "instances" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "instances" ADD COLUMN "root_password" text;