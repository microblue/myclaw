-- Belt-and-suspenders: on every new intent, automatically seed the
-- `main` (Claw) orchestrator into intent_agents. The aios wizard
-- ADDITIONALLY inserts the recommended specialists; if that client-
-- side call fails for any reason (network drop, race condition), the
-- intent at least has `main` so the TeamPanel doesn't render empty
-- and the chat orchestrator is reachable.
--
-- Idempotent via ON CONFLICT DO NOTHING since the (intent_id, agent_key)
-- primary key prevents duplicates.

set search_path = public;

create or replace function public.seed_intent_main_agent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.intent_agents (intent_id, agent_key, display_name, is_orchestrator)
    values (new.id, 'main', 'Claw', true)
    on conflict (intent_id, agent_key) do nothing;
    return new;
end;
$$;

drop trigger if exists seed_intent_main_agent on public.intents;
create trigger seed_intent_main_agent
    after insert on public.intents
    for each row execute function public.seed_intent_main_agent();
