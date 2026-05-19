-- memory_facts: assistant's user-level memory across intents. Phase 12
-- — /memory surface. Cross-intent (not per-intent) since "things to
-- remember about the user" survive the lifecycle of any single chat.
--
-- origin_intent_id is nullable + ON DELETE SET NULL so facts captured
-- during a specific chat survive deletion of that chat. aios can also
-- insert ad-hoc facts from a recap card without an intent reference.

set search_path = public;

create table public.memory_facts (
    id                 uuid primary key default gen_random_uuid(),
    user_id            uuid not null references auth.users(id) on delete cascade,
    category           text not null
                       check (category in ('about-you', 'people', 'preferences', 'project')),
    text               text not null,
    origin_intent_id   text references public.intents(id) on delete set null,
    created_at         timestamptz not null default now()
);

-- created_at DESC ordering for the standard "latest facts in this
-- category" list view.
create index memory_facts_user_category_idx
    on public.memory_facts (user_id, category, created_at desc);

alter table public.memory_facts enable row level security;

drop policy if exists "memory_facts_select_own" on public.memory_facts;
create policy "memory_facts_select_own"
    on public.memory_facts
    for select
    using (user_id = auth.uid());

drop policy if exists "memory_facts_insert_own" on public.memory_facts;
create policy "memory_facts_insert_own"
    on public.memory_facts
    for insert
    with check (user_id = auth.uid());

drop policy if exists "memory_facts_update_own" on public.memory_facts;
create policy "memory_facts_update_own"
    on public.memory_facts
    for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

drop policy if exists "memory_facts_delete_own" on public.memory_facts;
create policy "memory_facts_delete_own"
    on public.memory_facts
    for delete
    using (user_id = auth.uid());
