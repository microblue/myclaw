-- 0034: RBAC + channel partners + per-SKU quotas + audit log + idempotency keys
--
-- Implements docs/aios-design.md §4.1 / §4.5 / §16 / §19. is_admin is
-- *not* dropped here per the staged-deprecation plan (§8 step 1+3) —
-- we add `users.role` (already exists, default 'user') support in the
-- API code first; the column drop ships in a separate later migration
-- once production has rolled forward.

CREATE TABLE IF NOT EXISTS "channel_partners" (
    "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE RESTRICT,
    "display_name" text NOT NULL,
    "status" text NOT NULL DEFAULT 'active',
    "revenue_share_pct" numeric NOT NULL DEFAULT '0',
    "payout_method" jsonb,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "partner_quotas" (
    "partner_id" uuid NOT NULL REFERENCES "channel_partners"("user_id") ON DELETE CASCADE,
    "sku_kind" text NOT NULL,
    "validity_days" integer,
    "credit_usd" integer,
    "total" integer NOT NULL,
    "used" integer NOT NULL DEFAULT 0,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Composite uniqueness: one quota row per (partner, sku_kind, lifetime).
-- COALESCE the nullable columns so the unique index treats two NULL-d values
-- as equal (Postgres default treats NULLs as distinct, which would let a
-- partner accumulate dup quota rows for the same renewal SKU).
CREATE UNIQUE INDEX IF NOT EXISTS "partner_quotas_pk_idx"
    ON "partner_quotas" (
        "partner_id",
        "sku_kind",
        COALESCE("validity_days", -1),
        COALESCE("credit_usd", -1)
    );

CREATE TABLE IF NOT EXISTS "audit_log" (
    "id" text PRIMARY KEY,
    "actor_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "actor_role" text NOT NULL,
    "action" text NOT NULL,
    "target_kind" text,
    "target_id" text,
    "before_value" jsonb,
    "after_value" jsonb,
    "metadata" jsonb,
    "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "audit_log_actor_idx"
    ON "audit_log" ("actor_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_log_target_idx"
    ON "audit_log" ("target_kind", "target_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_log_action_idx"
    ON "audit_log" ("action", "created_at");

CREATE TABLE IF NOT EXISTS "idempotency_keys" (
    "key" text PRIMARY KEY,
    "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "request_hash" text NOT NULL,
    "status_code" integer NOT NULL,
    "response_body" jsonb NOT NULL,
    "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idempotency_keys_created_idx"
    ON "idempotency_keys" ("created_at");

-- Activation-codes additions: partner_id FK + container credit field.
-- partner_id is NULL on every existing row; super-admin manually maps
-- legacy partner_name → partner via /admin/partners.
ALTER TABLE "activation_codes"
    ADD COLUMN IF NOT EXISTS "partner_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "activation_codes"
    ADD COLUMN IF NOT EXISTS "credit_usd" integer;

CREATE INDEX IF NOT EXISTS "activation_codes_partner_id_idx"
    ON "activation_codes" ("partner_id");
