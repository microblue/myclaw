-- Multi-device + renewal-codes support per the white-paper revision.
-- Adds seat-count + sku_kind to activation_codes, swaps months → days,
-- and creates the per-seat history table activation_seats.

ALTER TABLE "activation_codes"
    ADD COLUMN IF NOT EXISTS "validity_days" integer,
    ADD COLUMN IF NOT EXISTS "sku_kind" text NOT NULL DEFAULT 'new',
    ADD COLUMN IF NOT EXISTS "seats" integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS "seats_used" integer NOT NULL DEFAULT 0;

-- Backfill validity_days from validity_months (1 month ≈ 30 days, good
-- enough for the existing batch — partner contracts only used months
-- as days/30 anyway).
UPDATE "activation_codes"
    SET "validity_days" = "validity_months" * 30
    WHERE "validity_months" IS NOT NULL AND "validity_days" IS NULL;

-- planId / provider / region are no longer NOT NULL because renewal
-- codes don't carry them.
ALTER TABLE "activation_codes"
    ALTER COLUMN "plan_id" DROP NOT NULL,
    ALTER COLUMN "provider" DROP NOT NULL,
    ALTER COLUMN "region" DROP NOT NULL;

-- Drop validity_months once dependencies are off it. Code switched to
-- validity_days in the same release; backfill above guarantees parity.
ALTER TABLE "activation_codes" DROP COLUMN IF EXISTS "validity_months";

CREATE INDEX IF NOT EXISTS "activation_codes_sku_kind_idx"
    ON "activation_codes" ("sku_kind");

CREATE TABLE IF NOT EXISTS "activation_seats" (
    "id" text PRIMARY KEY NOT NULL,
    "activation_code_id" text NOT NULL
        REFERENCES "activation_codes"("id") ON DELETE CASCADE,
    "redeemed_by_user_id" uuid NOT NULL
        REFERENCES "users"("id") ON DELETE SET NULL,
    "claw_id" text,
    "redeemed_at" timestamp with time zone NOT NULL DEFAULT now(),
    "expires_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "activation_seats_code_idx"
    ON "activation_seats" ("activation_code_id");
CREATE INDEX IF NOT EXISTS "activation_seats_user_idx"
    ON "activation_seats" ("redeemed_by_user_id");
CREATE INDEX IF NOT EXISTS "activation_seats_claw_idx"
    ON "activation_seats" ("claw_id");
