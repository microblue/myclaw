-- permission_grants: per-user capability toggles. Phase 13 —
-- /permissions surface. Composite PK (user_id, capability_id), no
-- separate uuid id — every row is one (user, capability) pair.
--
-- capability_id is a free text reference to a catalogue maintained
-- in aios (e.g. 'read.calendar', 'send.email'). Intentionally not a
-- FK to a capabilities table — aios owns the catalogue, the catalogue
-- moves faster than DB schema.
--
-- aios uses lazy upsert: a row that doesn't exist is treated as
-- mode='ask'. No pre-creation trigger by design.

set search_path = public;

create table public.permission_grants (
    user_id        uuid not null references auth.users(id) on delete cascade,
    capability_id  text not null,
    mode           text not null default 'ask'
                   check (mode in ('allow', 'ask', 'deny')),
    updated_at     timestamptz not null default now(),
    primary key (user_id, capability_id)
);

alter table public.permission_grants enable row level security;

drop policy if exists "permission_grants_select_own" on public.permission_grants;
create policy "permission_grants_select_own"
    on public.permission_grants
    for select
    using (user_id = auth.uid());

drop policy if exists "permission_grants_insert_own" on public.permission_grants;
create policy "permission_grants_insert_own"
    on public.permission_grants
    for insert
    with check (user_id = auth.uid());

drop policy if exists "permission_grants_update_own" on public.permission_grants;
create policy "permission_grants_update_own"
    on public.permission_grants
    for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

drop policy if exists "permission_grants_delete_own" on public.permission_grants;
create policy "permission_grants_delete_own"
    on public.permission_grants
    for delete
    using (user_id = auth.uid());
