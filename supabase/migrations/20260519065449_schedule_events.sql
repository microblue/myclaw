-- schedule_events: user-managed reminders (and later, cron-written
-- proactive ones). Phase 11 — /schedule surface.
--
-- intent_id is text to match prod intents.id (legacy text PK).
-- recurrence is nullable jsonb in the shape { kind, spec, label } where
-- kind ∈ 'daily' | 'weekly' | 'monthly' | 'cron' — schema-by-convention,
-- not enforced at DB level so the kind/spec catalogue can evolve in aios.

set search_path = public;

create table public.schedule_events (
    id          uuid primary key default gen_random_uuid(),
    intent_id   text  not null references public.intents(id) on delete cascade,
    user_id     uuid  not null references auth.users(id) on delete cascade,
    title       text  not null,
    fire_at     timestamptz not null,
    recurrence  jsonb,
    status      text not null default 'pending'
                check (status in ('pending', 'done', 'snoozed')),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- Pending-only partial index — the hot query is "what's next to fire
-- for this user?", and done/snoozed rows don't need to live in it.
create index schedule_events_user_fire_idx
    on public.schedule_events (user_id, fire_at)
    where status = 'pending';

alter table public.schedule_events enable row level security;

-- SELECT/UPDATE/DELETE: own rows only.
-- INSERT: own rows AND the targeted intent must also be yours. Without
-- the EXISTS-join an attacker could schedule a reminder pointing at a
-- stranger's intent_id (the row would still be RLS-isolated to them,
-- but FK to intents.id would succeed and the row would carry a foreign
-- intent reference — junk data).

drop policy if exists "schedule_events_select_own" on public.schedule_events;
create policy "schedule_events_select_own"
    on public.schedule_events
    for select
    using (user_id = auth.uid());

drop policy if exists "schedule_events_insert_own" on public.schedule_events;
create policy "schedule_events_insert_own"
    on public.schedule_events
    for insert
    with check (
        user_id = auth.uid()
        and exists (
            select 1 from public.intents
            where intents.id = schedule_events.intent_id
              and intents.user_id = auth.uid()
        )
    );

drop policy if exists "schedule_events_update_own" on public.schedule_events;
create policy "schedule_events_update_own"
    on public.schedule_events
    for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

drop policy if exists "schedule_events_delete_own" on public.schedule_events;
create policy "schedule_events_delete_own"
    on public.schedule_events
    for delete
    using (user_id = auth.uid());

drop trigger if exists schedule_events_set_updated_at on public.schedule_events;
create trigger schedule_events_set_updated_at
    before update on public.schedule_events
    for each row execute function public.set_updated_at();
