-- Add agent_id to messages so each assistant turn carries the persona
-- that produced it. Lets aios render different agents with their own
-- emoji + name in the chat (e.g. 🔬研究员 vs ✍️写手).
--
-- Nullable: existing messages stay null and the SPA falls back to a
-- generic "助手" rendering for them. New writes from useGatewayChat
-- include the active agent id.

alter table public.messages
    add column if not exists agent_id text;

-- No FK to anywhere — agents are filesystem-resident on OpenClaw, not
-- Supabase rows. Plain text. Trim it cheap.
create index if not exists messages_intent_agent_idx
    on public.messages (intent_id, agent_id)
    where agent_id is not null;
