-- approvals: pending approvals waiting for user decision. Phase 14 —
-- /now surface (top section). Realtime: aios subscribes to push new
-- approvals onto the Now panel without polling.
--
-- options is a free-form jsonb array; aios shape is
-- [{ label, kind: 'primary'|'secondary' }, ...]. Not enforced — keep
-- the UI option-set flexible.

set search_path = public;

create table public.approvals (
    id           uuid primary key default gen_random_uuid(),
    intent_id    text not null references public.intents(id) on delete cascade,
    user_id      uuid not null references auth.users(id) on delete cascade,
    prompt       text not null,
    detail       text,
    agent_key    text,
    options      jsonb,
    status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected', 'cancelled')),
    resolved_at  timestamptz,
    created_at   timestamptz not null default now()
);

-- Pending-only partial index — Now panel shows status='pending' newest
-- first; resolved approvals don't need to live in the hot index.
create index approvals_user_status_idx
    on public.approvals (user_id, status, created_at desc)
    where status = 'pending';

alter table public.approvals enable row level security;

drop policy if exists "approvals_select_own" on public.approvals;
create policy "approvals_select_own"
    on public.approvals
    for select
    using (user_id = auth.uid());

drop policy if exists "approvals_insert_own" on public.approvals;
create policy "approvals_insert_own"
    on public.approvals
    for insert
    with check (user_id = auth.uid());

drop policy if exists "approvals_update_own" on public.approvals;
create policy "approvals_update_own"
    on public.approvals
    for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

drop policy if exists "approvals_delete_own" on public.approvals;
create policy "approvals_delete_own"
    on public.approvals
    for delete
    using (user_id = auth.uid());

-- Realtime publication membership — aios subscribes to push new
-- approvals onto the Now panel. Idempotent via duplicate_object trap,
-- matches the pattern from messages / install phases.
do $$
begin
    alter publication supabase_realtime add table public.approvals;
exception
    when duplicate_object then
        null;
end $$;
