-- Add Polar customer ID to users
ALTER TABLE "users" ADD COLUMN "polar_customer_id" text;

-- Add Polar subscription fields to claws
ALTER TABLE "claws" ADD COLUMN "polar_subscription_id" text;
ALTER TABLE "claws" ADD COLUMN "polar_product_id" text;
ALTER TABLE "claws" ADD COLUMN "polar_customer_id" text;
ALTER TABLE "claws" ADD COLUMN "subscription_status" text DEFAULT 'pending';

-- Create pending_claws table for checkout sessions awaiting payment
CREATE TABLE IF NOT EXISTS "pending_claws" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"checkout_id" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"plan_id" text NOT NULL,
	"location" text NOT NULL,
	"root_password" text,
	"ssh_key_id" text,
	"volume_size" integer,
	"price_monthly" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);

-- Add foreign key constraints
ALTER TABLE "pending_claws" ADD CONSTRAINT "pending_claws_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "pending_claws" ADD CONSTRAINT "pending_claws_ssh_key_id_ssh_keys_id_fk" FOREIGN KEY ("ssh_key_id") REFERENCES "ssh_keys"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
