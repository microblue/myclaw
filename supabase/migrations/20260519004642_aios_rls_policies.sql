-- RLS policies for the tables myclaw-aios reads/writes via anon JWT.
--
-- Pre-state in prod:
--   - intents / intent_agents / intent_artifacts: RLS OFF (no policies)
--   - claws / users: RLS ON, zero policies (= anon sees nothing; the
--     myclaw API uses service-role and bypasses RLS, so this didn't
--     matter before aios)
--
-- Post-state: each table opens up to authenticated users on their own
-- rows only. Child tables (intent_agents, intent_artifacts) gate via
-- EXISTS-join on intents.user_id since they don't carry user_id themselves.
--
-- claws gets SELECT-own only — aios reads "do I have any claws?" to
-- decide whether to show the dashboard or the "go create one" CTA at
-- myclaw.one/aios/install. Writes still go through the myclaw API with
-- service-role; never via aios.
--
-- Idempotent: DROP POLICY IF EXISTS before each CREATE so re-runs and
-- partial earlier states (e.g. someone added an intents policy by hand)
-- converge.

set search_path = public;

-- intents -------------------------------------------------------------

alter table public.intents enable row level security;

drop policy if exists "intents_select_own" on public.intents;
create policy "intents_select_own"
  on public.intents
  for select
  using (user_id = auth.uid());

drop policy if exists "intents_insert_own" on public.intents;
create policy "intents_insert_own"
  on public.intents
  for insert
  with check (user_id = auth.uid());

drop policy if exists "intents_update_own" on public.intents;
create policy "intents_update_own"
  on public.intents
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "intents_delete_own" on public.intents;
create policy "intents_delete_own"
  on public.intents
  for delete
  using (user_id = auth.uid());

-- intent_agents -------------------------------------------------------
-- No user_id column; ownership is inherited from the parent intent.

alter table public.intent_agents enable row level security;

drop policy if exists "intent_agents_select_own" on public.intent_agents;
create policy "intent_agents_select_own"
  on public.intent_agents
  for select
  using (
    exists (
      select 1 from public.intents
      where intents.id = intent_agents.intent_id
        and intents.user_id = auth.uid()
    )
  );

drop policy if exists "intent_agents_insert_own" on public.intent_agents;
create policy "intent_agents_insert_own"
  on public.intent_agents
  for insert
  with check (
    exists (
      select 1 from public.intents
      where intents.id = intent_agents.intent_id
        and intents.user_id = auth.uid()
    )
  );

drop policy if exists "intent_agents_update_own" on public.intent_agents;
create policy "intent_agents_update_own"
  on public.intent_agents
  for update
  using (
    exists (
      select 1 from public.intents
      where intents.id = intent_agents.intent_id
        and intents.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.intents
      where intents.id = intent_agents.intent_id
        and intents.user_id = auth.uid()
    )
  );

drop policy if exists "intent_agents_delete_own" on public.intent_agents;
create policy "intent_agents_delete_own"
  on public.intent_agents
  for delete
  using (
    exists (
      select 1 from public.intents
      where intents.id = intent_agents.intent_id
        and intents.user_id = auth.uid()
    )
  );

-- intent_artifacts ----------------------------------------------------

alter table public.intent_artifacts enable row level security;

drop policy if exists "intent_artifacts_select_own" on public.intent_artifacts;
create policy "intent_artifacts_select_own"
  on public.intent_artifacts
  for select
  using (
    exists (
      select 1 from public.intents
      where intents.id = intent_artifacts.intent_id
        and intents.user_id = auth.uid()
    )
  );

drop policy if exists "intent_artifacts_insert_own" on public.intent_artifacts;
create policy "intent_artifacts_insert_own"
  on public.intent_artifacts
  for insert
  with check (
    exists (
      select 1 from public.intents
      where intents.id = intent_artifacts.intent_id
        and intents.user_id = auth.uid()
    )
  );

drop policy if exists "intent_artifacts_update_own" on public.intent_artifacts;
create policy "intent_artifacts_update_own"
  on public.intent_artifacts
  for update
  using (
    exists (
      select 1 from public.intents
      where intents.id = intent_artifacts.intent_id
        and intents.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.intents
      where intents.id = intent_artifacts.intent_id
        and intents.user_id = auth.uid()
    )
  );

drop policy if exists "intent_artifacts_delete_own" on public.intent_artifacts;
create policy "intent_artifacts_delete_own"
  on public.intent_artifacts
  for delete
  using (
    exists (
      select 1 from public.intents
      where intents.id = intent_artifacts.intent_id
        and intents.user_id = auth.uid()
    )
  );

-- claws ---------------------------------------------------------------
-- aios reads its own claws to render the dashboard / fall back to the
-- "create your AI OS" CTA when the user has zero. Mutations (insert /
-- delete / status flips) are owned exclusively by the myclaw API under
-- service-role, so we deliberately do NOT expose INSERT/UPDATE/DELETE
-- to authenticated users.

drop policy if exists "claws_select_own" on public.claws;
create policy "claws_select_own"
  on public.claws
  for select
  using (user_id = auth.uid());
