CREATE INDEX IF NOT EXISTS "claws_status_idx" ON "claws" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "claws_provider_idx" ON "claws" USING btree ("provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_polar_customer_id_idx" ON "users" USING btree ("polar_customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_referred_by_idx" ON "users" USING btree ("referred_by");
