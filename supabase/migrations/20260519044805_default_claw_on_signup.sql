-- Extend handle_new_auth_user() to also provision one default claw per
-- new user so aios can exercise its create-intent flow end-to-end
-- during the prototype phase. Until myclaw.one/aios/install ships,
-- this trigger is the only path that gives a fresh user a writable
-- claw_id. Remove (or guard behind a feature flag) once the real
-- purchase flow is live.
--
-- Sentinel values chosen so this row stands out from a real
-- activation-code-redeemed claw and so the existing provisioning /
-- sync workers ignore it:
--   provider   = 'aios'           — not in providerRegistry; sync workers
--                                   short-circuit before touching it.
--   claw_type  = 'aios-default'   — distinguishes from 'openclaw' /
--                                   'picoclaw' etc.
--   status     = 'active'         — terminal status not in the sync
--                                   scheduler's TRANSIENT_STATUSES set,
--                                   so background workers leave it alone.
--   plan_id    = 'aios-prototype' — sentinel; provisioning code's plan
--                                   lookup will fail loudly if anything
--                                   tries to actually start a VM/container
--                                   for this row.
--
-- claws.id is text (legacy from the pre-Supabase schema); cast the
-- generated UUID to text. Other text fields (subdomain, gateway_token,
-- ip, root_password) stay null on the stub row — they're nullable in
-- the schema, and a stub claw has no real subdomain / token / VM.

set search_path = public;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id) values (new.id)
    on conflict (id) do nothing;

  insert into public.claws (
    id, user_id, name, plan_id, provider, claw_type, status
  ) values (
    gen_random_uuid()::text,
    new.id,
    'My first claw',
    'aios-prototype',
    'aios',
    'aios-default',
    'active'
  );

  return new;
end;
$$;
