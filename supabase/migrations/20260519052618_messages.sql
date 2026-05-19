-- messages: persistent chat turns, multi-modal from day 1.
--
-- Schema contract from aios mock layer (myclaw-aios/src/mocks/types.ts).
-- content stays jsonb (not flattened to text) because the typed-parts
-- union { type:'text' } | { type:'image' } | { type:'file_ref' } is
-- canonical from Phase 6 onward.
--
-- One deviation from the aios mock: intent_id is text, not uuid. The
-- prod intents table uses text PKs (legacy from the drizzle 0036
-- migration, predates the supabase canonical reset). FK has to match.
-- aios's mock typing will continue to use string at runtime; only the
-- on-disk type is text vs uuid.

set search_path = public;

-- Table -------------------------------------------------------------

create table public.messages (
    id          uuid primary key default gen_random_uuid(),
    intent_id   text not null references public.intents(id) on delete cascade,
    user_id     uuid not null references auth.users(id) on delete cascade,
    role        text not null check (role in ('user', 'assistant', 'system')),
    content     jsonb not null,
    status      text default 'sent',
    created_at  timestamptz not null default now()
);

create index messages_intent_id_created_at_idx
    on public.messages (intent_id, created_at);

-- RLS ---------------------------------------------------------------
-- Per spec: 4 own-row policies keyed on user_id = auth.uid(). No
-- EXISTS-join on intents.user_id at the policy level. The intents
-- table's own UPDATE RLS protects the last_message_preview sync (an
-- attacker who crafted a message pointing at another user's intent
-- would slip the message into their own RLS-isolated view, but the
-- trigger's UPDATE on intents fails RLS and affects 0 rows — no
-- preview leak to the victim).

alter table public.messages enable row level security;

drop policy if exists "messages_select_own" on public.messages;
create policy "messages_select_own"
    on public.messages
    for select
    using (user_id = auth.uid());

drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own"
    on public.messages
    for insert
    with check (user_id = auth.uid());

drop policy if exists "messages_update_own" on public.messages;
create policy "messages_update_own"
    on public.messages
    for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

drop policy if exists "messages_delete_own" on public.messages;
create policy "messages_delete_own"
    on public.messages
    for delete
    using (user_id = auth.uid());

-- Realtime publication ----------------------------------------------
-- Idempotent via DO/EXCEPTION — ALTER PUBLICATION ADD TABLE errors
-- with duplicate_object if the table is already a member, matches
-- the 0038_realtime_publication_install_phases.sql pattern.

do $$
begin
    alter publication supabase_realtime add table public.messages;
exception
    when duplicate_object then
        null;
end $$;

-- last_message_* sync trigger ---------------------------------------
-- After every INSERT on messages, push the first content part's text
-- (truncated to 80 chars) into intents.last_message_preview and stamp
-- last_message_at. aios's list view then renders preview without
-- pulling messages.
--
-- content[0] -> 'text' is the canonical shape ({type:'text', text:'…'}
-- as the leading part for a user/assistant turn); if the first part is
-- an image/file_ref, content[0]->>'text' is NULL and the preview
-- becomes NULL — that's intentional.
--
-- Not SECURITY DEFINER: runs under the inserter's role. If a row was
-- somehow inserted pointing at another user's intent (bypassing the
-- intents RLS), the UPDATE here just hits 0 rows under intents' own
-- "user_id = auth.uid()" UPDATE policy.

create or replace function public.sync_intent_last_message()
returns trigger
language plpgsql
as $$
declare
    preview_text text;
begin
    preview_text := substring((new.content -> 0 ->> 'text') from 1 for 80);

    update public.intents
        set last_message_preview = preview_text,
            last_message_at      = new.created_at
        where id = new.intent_id;

    return null;
end;
$$;

drop trigger if exists messages_sync_intent_preview on public.messages;
create trigger messages_sync_intent_preview
    after insert on public.messages
    for each row execute function public.sync_intent_last_message();
