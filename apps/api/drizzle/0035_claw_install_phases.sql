-- 0035: install-phase tracking + claw outbound token
--
-- Implements docs/aios-design.md §4.3 / §4.4 — the substrate that
-- P2b's install animation reads from. Idempotent (CREATE TABLE / COLUMN
-- IF NOT EXISTS) so re-runs are safe.
--
-- claws.install_run_id  ULID per install attempt; cleared/replaced on
--                       re-install. Web Realtime subscription scopes to
--                       this so log tails don't bleed across attempts.
-- claws.central_token   Per-claw outbound bearer used by the cloud-init
--                       installer + the claw runtime to call central API
--                       endpoints (phase emit, outline push). Separate
--                       from the inbound gateway_token so it can be
--                       rotated independently. Existing claws get NULL
--                       and never emit phases (legacy fleet stays put);
--                       new claws have a token generated at insert time.

ALTER TABLE "claws" ADD COLUMN IF NOT EXISTS "install_run_id" text;
ALTER TABLE "claws" ADD COLUMN IF NOT EXISTS "central_token" text;

CREATE TABLE IF NOT EXISTS "claw_install_phases" (
    "id" text PRIMARY KEY,
    "claw_id" text NOT NULL REFERENCES "claws"("id") ON DELETE CASCADE,
    "install_run_id" text NOT NULL,
    "phase" text NOT NULL,
    "log_chunk" text NOT NULL,
    "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "claw_install_phases_run_idx"
    ON "claw_install_phases" ("claw_id", "install_run_id", "created_at");
