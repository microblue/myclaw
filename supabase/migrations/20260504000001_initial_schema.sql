-- myclaw schema, redesigned for Supabase auth.
--
-- public.users.id is uuid REFERENCES auth.users(id) — auth.users is the
-- identity of record; public.users holds profile/business fields. Email
-- and password live in auth.users; queries that need email JOIN auth.users.
--
-- All other tables that reference a user use uuid columns FK'd to public.users.
--
-- RLS is enabled on every public table with no policies attached, so
-- anon and authenticated roles can't see anything via PostgREST. The API
-- connects with the service-role key and bypasses RLS at the DB layer.
-- Tighter per-row policies can be added later when we move the frontend
-- to query Supabase directly.

set search_path = public;

create table public.users (
    id uuid primary key references auth.users(id) on delete cascade,
    name text,
    polar_customer_id text,
    role text not null default 'user',
    referral_code text unique,
    referral_code_changed boolean not null default false,
    referred_by uuid references public.users(id) on delete set null,
    has_license boolean not null default false,
    created_at timestamptz not null default now()
);
create index users_polar_customer_id_idx on public.users (polar_customer_id);
create index users_referred_by_idx on public.users (referred_by);

-- Auto-create a public.users row whenever a new auth.users row is inserted.
-- Supabase exposes auth.signUp() as the only signup path; this trigger keeps
-- the two in sync without anyone having to remember.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.users (id) values (new.id) on conflict (id) do nothing;
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_auth_user();

create table public.ssh_keys (
    id text primary key,
    user_id uuid not null references public.users(id) on delete cascade,
    name text not null,
    public_key text not null,
    fingerprint text not null,
    provider_key_id integer,
    created_at timestamp not null default now()
);

create table public.claws (
    id text primary key,
    user_id uuid not null references public.users(id) on delete cascade,
    name text not null,
    provider text not null default 'hetzner',
    claw_type text not null default 'openclaw',
    provider_server_id text,
    status text not null default 'creating',
    ip text,
    plan_id text not null,
    location text,
    root_password text,
    ssh_key_id text references public.ssh_keys(id),
    subdomain text unique,
    gateway_token text,
    polar_subscription_id text unique,
    polar_product_id text,
    polar_customer_id text,
    subscription_status text default 'pending',
    deletion_scheduled_at timestamp,
    model text,
    last_reinstalled_at timestamptz,
    billing_interval text,
    activation_code_id text,
    created_at timestamp not null default now()
);
create index claws_status_idx on public.claws (status);
create index claws_provider_idx on public.claws (provider);

create table public.volumes (
    id text primary key,
    user_id uuid not null references public.users(id) on delete cascade,
    claw_id text references public.claws(id),
    name text not null,
    size integer not null,
    provider_volume_id integer,
    location text not null,
    status text not null default 'creating',
    created_at timestamp not null default now()
);

create table public.pending_claws (
    id text primary key,
    user_id uuid not null references public.users(id) on delete cascade,
    checkout_id text not null unique,
    name text not null,
    plan_id text not null,
    provider text not null default 'hetzner',
    claw_type text not null default 'openclaw',
    location text not null,
    root_password text,
    ssh_key_id text references public.ssh_keys(id),
    volume_size integer,
    price_monthly integer not null,
    billing_interval text,
    referral_code text,
    model text,
    api_token text,
    created_at timestamp not null default now(),
    expires_at timestamp not null
);

create table public.claw_exports (
    id text primary key,
    user_id uuid not null references public.users(id) on delete cascade,
    claw_id text not null references public.claws(id) on delete cascade,
    file_size integer,
    created_at timestamp not null default now()
);

create table public.waitlist (
    id text primary key,
    email text not null unique,
    user_id uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now()
);
create index waitlist_email_idx on public.waitlist (email);

create table public.referrals (
    id text primary key,
    referrer_id uuid not null references public.users(id) on delete cascade,
    referred_user_id uuid not null unique references public.users(id) on delete cascade,
    created_at timestamptz not null default now()
);
create index referrals_referrer_id_idx on public.referrals (referrer_id);
create index referrals_referred_user_id_idx on public.referrals (referred_user_id);

create table public.referral_payments (
    id text primary key,
    referral_id text not null references public.referrals(id) on delete cascade,
    amount integer not null default 0,
    type text not null default 'purchase',
    created_at timestamptz not null default now()
);
create index referral_payments_referral_id_idx on public.referral_payments (referral_id);

create table public.activation_codes (
    id text primary key,
    code text not null unique,
    plan_id text not null,
    provider text not null default 'hetzner',
    region text not null,
    tier_label text,
    partner_name text,
    batch_id text,
    notes text,
    validity_months integer,
    status text not null default 'unused',
    redeemed_by_user_id uuid references public.users(id) on delete set null,
    redeemed_claw_id text,
    redeemed_at timestamptz,
    expires_at timestamptz,
    created_by_user_id uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now()
);
create index activation_codes_status_idx on public.activation_codes (status);
create index activation_codes_partner_idx on public.activation_codes (partner_name);
create index activation_codes_batch_idx on public.activation_codes (batch_id);

create table public.system_settings (
    key text primary key,
    value text,
    updated_by uuid references public.users(id) on delete set null,
    updated_at timestamptz not null default now()
);

create table public.rate_limits (
    key text primary key,
    last_sent_at timestamp not null
);

-- RLS: enable everywhere with no policies. Anon + authenticated roles
-- through PostgREST can't read anything; the API uses service-role and
-- bypasses RLS. Add per-table policies later if/when frontend talks to
-- Supabase directly.
alter table public.users enable row level security;
alter table public.ssh_keys enable row level security;
alter table public.claws enable row level security;
alter table public.volumes enable row level security;
alter table public.pending_claws enable row level security;
alter table public.claw_exports enable row level security;
alter table public.waitlist enable row level security;
alter table public.referrals enable row level security;
alter table public.referral_payments enable row level security;
alter table public.activation_codes enable row level security;
alter table public.system_settings enable row level security;
alter table public.rate_limits enable row level security;

create table public.emails (
    id text primary key,
    user_id uuid not null references public.users(id) on delete cascade,
    feature text not null,
    sent_at timestamptz not null default now()
);
create index emails_user_id_idx on public.emails (user_id);
create unique index emails_user_feature on public.emails (user_id, feature);
alter table public.emails enable row level security;

create table public.install_reports (
    id text primary key,
    install_id text not null,
    desktop_version text not null,
    platform text not null,
    arch text not null,
    os_release text not null,
    node_version text not null,
    hostname text not null,
    username text not null,
    bootstrap_phase text not null,
    error_message text not null,
    error_stack text,
    logs text not null,
    env_info jsonb not null,
    ip text,
    user_agent text,
    created_at timestamptz not null default now()
);
create index install_reports_install_id_idx on public.install_reports (install_id);
create index install_reports_created_at_idx on public.install_reports (created_at);
create index install_reports_phase_idx on public.install_reports (bootstrap_phase);
alter table public.install_reports enable row level security;
