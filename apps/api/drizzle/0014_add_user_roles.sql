ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;
--> statement-breakpoint
UPDATE "users" SET "role" = 'admin' WHERE "email" = 'bfzli@hotmail.com';