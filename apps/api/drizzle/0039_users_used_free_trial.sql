-- 0039: track which users have already redeemed the public free trial.
--
-- Adding a per-user boolean is simpler than scanning activation_codes for a
-- "free-trial" partner_name on every sign-up: redemption flows can flip the
-- bit in the same transaction that mints the trial code, and the gate
-- becomes a single index-friendly column read.

ALTER TABLE "users"
    ADD COLUMN "used_free_trial" boolean NOT NULL DEFAULT false;
