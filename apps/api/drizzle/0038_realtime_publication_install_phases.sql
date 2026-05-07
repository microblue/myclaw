-- 0038: enable Supabase Realtime broadcast for claw_install_phases
--
-- The progress page at /aios/install/:id subscribes to INSERT events
-- via supabase.channel() so each new phase row animates the install
-- checklist live. That subscription returns SUBSCRIBED, but no events
-- ever arrived because the table had never been added to the
-- supabase_realtime publication — Postgres-level changes weren't being
-- replicated out. Symptom: the page hangs at "Allocating your
-- machine" (the API-seeded renting_compute row that the backfill
-- SELECT picks up at mount time) even though install-claw.sh logs
-- every later phase to the table just fine.
--
-- Idempotent via DO/EXCEPTION — ALTER PUBLICATION ADD TABLE errors
-- if the table is already a member, so we trap that.

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.claw_install_phases;
EXCEPTION
    WHEN duplicate_object THEN
        -- Already in the publication; nothing to do.
        NULL;
END $$;
