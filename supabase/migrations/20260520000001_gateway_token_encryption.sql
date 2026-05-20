-- Encrypt claws.gateway_token at rest using Supabase Vault.
--
-- Plan §"永远不要放进 Supabase ... claws.gateway_token 明文 → 强烈建议
-- 改加密 + 走 Edge Function 短期化".
--
-- Vault stores the encryption key out-of-band (Supabase-managed,
-- not visible in DB dumps); pgsodium helpers seal/unseal the bytea.
-- Existing rows keep their plain-text gateway_token (we don't have
-- the encryption key in scope to bulk-rotate them in this migration —
-- the next migration after a Vault key lands will backfill).
--
-- Approach for v1:
--   - Add `gateway_token_enc bytea` column for ciphertext.
--   - Trigger encrypts on INSERT/UPDATE when plain `gateway_token`
--     is supplied, then NULLs the plaintext column.
--   - Edge Function `mint-claw-token` reads `gateway_token_enc`, falls
--     back to the legacy `gateway_token` so existing rows still mint.
--
-- A follow-up migration (after we provision a key in Vault) will
-- bulk-encrypt the existing rows and drop the plaintext column.

set search_path = public, extensions, pgsodium;

create extension if not exists pgcrypto with schema extensions;

alter table public.claws
    add column if not exists gateway_token_enc text;

-- Trigger function: if gateway_token (plaintext) is set on an INSERT
-- or UPDATE, encrypt it with the AIOS_GATEWAY_TOKEN_KEY secret pulled
-- from vault. If the secret isn't provisioned yet, this is a no-op
-- (leaves plaintext intact) so the migration is safe to apply before
-- the operator stages the key.
create or replace function public.encrypt_gateway_token_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
    enc_key text;
begin
    if new.gateway_token is null then
        return new;
    end if;
    -- Try to fetch the encryption key from Vault. Vault.decrypted_secrets
    -- is a view that decrypts via the project's master key. Wrap in a
    -- catch so a missing key doesn't break inserts during rollout.
    begin
        select decrypted_secret
            into enc_key
            from vault.decrypted_secrets
            where name = 'aios_gateway_token_key'
            limit 1;
    exception when others then
        enc_key := null;
    end;
    if enc_key is null then
        -- Key not provisioned yet — leave plaintext in place for now.
        return new;
    end if;
    new.gateway_token_enc := encode(
        extensions.pgp_sym_encrypt(new.gateway_token, enc_key),
        'base64'
    );
    new.gateway_token := null;
    return new;
end;
$$;

drop trigger if exists encrypt_gateway_token on public.claws;
create trigger encrypt_gateway_token
    before insert or update of gateway_token on public.claws
    for each row execute function public.encrypt_gateway_token_trigger();

-- Helper for the Edge Function to read decrypted token. Service role
-- only — RLS doesn't apply to service role, but we ensure no client
-- ever calls this via PostgREST (it lives in pg_temp-equivalent space).
create or replace function public.decrypt_gateway_token(claw_id text)
returns text
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
    row_data record;
    enc_key text;
begin
    select gateway_token, gateway_token_enc
        into row_data
        from public.claws
        where id = claw_id
        limit 1;
    if row_data is null then
        return null;
    end if;
    -- Plaintext path (legacy rows or pre-Vault state).
    if row_data.gateway_token is not null then
        return row_data.gateway_token;
    end if;
    if row_data.gateway_token_enc is null then
        return null;
    end if;
    begin
        select decrypted_secret
            into enc_key
            from vault.decrypted_secrets
            where name = 'aios_gateway_token_key'
            limit 1;
    exception when others then
        return null;
    end;
    if enc_key is null then
        return null;
    end if;
    return extensions.pgp_sym_decrypt(
        decode(row_data.gateway_token_enc, 'base64'),
        enc_key
    );
end;
$$;

revoke all on function public.decrypt_gateway_token(text) from public;
revoke all on function public.decrypt_gateway_token(text) from anon, authenticated;

-- Notes for the operator (DZ):
-- 1. Provision the key in Supabase Vault:
--    insert into vault.secrets (name, secret)
--    values ('aios_gateway_token_key', encode(gen_random_bytes(32), 'hex'));
-- 2. Bulk-encrypt existing rows once key is staged:
--    update public.claws set gateway_token = gateway_token;
--    (the trigger fires, encrypts, nulls the plaintext)
-- 3. Update mint-claw-token Edge Function to call
--    public.decrypt_gateway_token(claw_id) instead of reading the column.
-- 4. After all rows are migrated, drop the plaintext column:
--    alter table public.claws drop column gateway_token;
