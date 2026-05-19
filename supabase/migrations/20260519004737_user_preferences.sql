-- user_preferences: cosmetic profile bits aios renders (display_name,
-- emoji, cover image, preferred language). aios was hashing these from
-- the user_id placeholder; once this lands aios reads the real values.
--
-- Also: per-intent cosmetic overrides on the intents table itself, so a
-- user can give one chat a different emoji/cover without changing their
-- account-level default.
--
-- public.set_updated_at(): no public updated_at trigger fn existed in
-- prod (verified: SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema='public' AND routine_name LIKE '%updated_at%';
-- returned zero rows). Define one here once for all future tables.
--
-- Decision on intents.preview: kept it. last_message_preview is the
-- claw-pushed snapshot of the most recent message and gets overwritten
-- on every push; preview is the user's editable short description of
-- what the intent is for ("Tax planning 2026", "Trip to Kyoto") and
-- survives across messages. Different lifecycles, both useful.

set search_path = public;

-- updated_at helper ---------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- user_preferences ----------------------------------------------------

create table if not exists public.user_preferences (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  display_name   text,
  default_emoji  text default '✨',
  default_cover  text,
  preferred_lang text default 'zh-CN'
    check (preferred_lang in ('en','zh-CN','zh-TW','ja','ko','es')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists "user_preferences_select_own" on public.user_preferences;
create policy "user_preferences_select_own"
  on public.user_preferences
  for select
  using (user_id = auth.uid());

drop policy if exists "user_preferences_insert_own" on public.user_preferences;
create policy "user_preferences_insert_own"
  on public.user_preferences
  for insert
  with check (user_id = auth.uid());

drop policy if exists "user_preferences_update_own" on public.user_preferences;
create policy "user_preferences_update_own"
  on public.user_preferences
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "user_preferences_delete_own" on public.user_preferences;
create policy "user_preferences_delete_own"
  on public.user_preferences
  for delete
  using (user_id = auth.uid());

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- intents: per-intent cosmetic overrides ------------------------------

alter table public.intents add column if not exists emoji   text;
alter table public.intents add column if not exists cover   text;
alter table public.intents add column if not exists preview text;
