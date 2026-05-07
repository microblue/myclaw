-- 0036: Intent metadata layer (sovereign architecture)
--
-- Implements docs/aios-design.md §4.2 — Intent metadata lives
-- centrally, but messages + outline + artifact bytes stay on the
-- AI-OS itself. The columns we keep here are exactly the ones the
-- /aios list view needs without a round-trip into a claw:
--   - id / claw_id / user_id / title (cross-device list)
--   - last_message_preview / last_message_at (claw-pushed snapshot
--     so the list shows "what's the latest?" without round-trip)
--   - archived_at (filter)
--
-- Idempotent (CREATE TABLE / INDEX IF NOT EXISTS); safe to re-run.

CREATE TABLE IF NOT EXISTS "intents" (
    "id" text PRIMARY KEY,
    "claw_id" text NOT NULL REFERENCES "claws"("id") ON DELETE CASCADE,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "title" text NOT NULL,
    "last_message_preview" text,
    "last_message_at" timestamptz,
    "archived_at" timestamptz,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "intents_claw_user_idx"
    ON "intents" ("claw_id", "user_id");

-- Agents bound to an Intent. The composite PK (intent_id, agent_key)
-- gives us idempotent upserts on re-attach. The partial unique index
-- enforces "at most one orchestrator per Intent" at the DB level —
-- two concurrent promote-to-orchestrator requests can't both win.
CREATE TABLE IF NOT EXISTS "intent_agents" (
    "intent_id" text NOT NULL REFERENCES "intents"("id") ON DELETE CASCADE,
    "agent_key" text NOT NULL,
    "display_name" text NOT NULL,
    "is_orchestrator" boolean NOT NULL DEFAULT false,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "intent_agents_pk" PRIMARY KEY ("intent_id", "agent_key")
);
CREATE UNIQUE INDEX IF NOT EXISTS "intent_agents_one_orchestrator"
    ON "intent_agents" ("intent_id")
    WHERE "is_orchestrator" = true;

-- Artifact pointers. The bytes never live centrally — `pointer` is an
-- opaque path-on-claw the SPA hands back to the claw to fetch.
-- `sha256` is reported by the claw at create-time; central re-verifies
-- on download and stamps `verified_at` on success.
CREATE TABLE IF NOT EXISTS "intent_artifacts" (
    "id" text PRIMARY KEY,
    "intent_id" text NOT NULL REFERENCES "intents"("id") ON DELETE CASCADE,
    "kind" text NOT NULL,
    "name" text NOT NULL,
    "pointer" text NOT NULL,
    "size_bytes" bigint,
    "sha256" text,
    "verified_at" timestamptz,
    "created_by_agent" text,
    "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "intent_artifacts_intent_idx"
    ON "intent_artifacts" ("intent_id");
