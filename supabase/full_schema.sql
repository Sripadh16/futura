-- ============================================================
-- DIGITAL REBEL (FUTURA) — MASTER DATABASE SCHEMA
-- Execute this entire script in your Supabase SQL Editor
-- to set up all tables, RLS policies, triggers, and RPCs.
-- ============================================================

-- 1. Enable pgcrypto extension for UUID generation
create extension if not exists pgcrypto;

-- 2. Profiles Table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  bio text,
  age integer,
  retirement_age integer,
  monthly_income numeric(10,2),
  target_monthly_income numeric(10,2),
  zens integer not null default 100,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now()
);

-- 3. User Goals Table
create table if not exists public.user_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  current_age int2 not null,
  retirement_age int2 not null,
  target_monthly_income numeric(10,2) not null,
  annual_return_rate numeric(5,4) not null default 0.0700,
  risk_profile text default 'moderate' check (risk_profile in ('conservative', 'moderate', 'aggressive')),
  updated_at timestamptz not null default now()
);

-- 4. Contributions Ledger Table
create table if not exists public.contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(10,2) not null,
  currency text not null default 'GBP',
  contribution_date date not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_contributions_user_date
  on public.contributions (user_id, contribution_date desc);

-- 5. User Subscriptions Table
create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  entitlement text not null default 'free' check (entitlement in ('free', 'pro', 'elite')),
  streak_recovery_tokens integer not null default 0,
  display_name text,
  last_token_reset timestamp with time zone default now(),
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- 6. Streaks Gamification Table
create table if not exists public.streaks (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  current_streak int4 not null default 0,
  longest_streak int4 not null default 0,
  previous_streak int4 not null default 0,
  last_contribution_date date,
  updated_at timestamptz not null default now()
);

-- 7. Portfolio Holdings Table (Simulated Trading)
create table if not exists public.portfolio_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ticker text not null,
  company_name text not null,
  amount_zens integer not null,
  price_at_purchase integer not null default 0,
  purchase_date date not null default current_date,
  sold boolean not null default false,
  sell_proceeds integer,
  sell_pnl integer,
  sell_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_portfolio_user_date
  on public.portfolio_holdings (user_id, purchase_date desc);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Profiles RLS
alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid());

create policy "profiles_delete_own"
  on public.profiles for delete
  using (id = auth.uid());

-- User Goals RLS
alter table public.user_goals enable row level security;

create policy "goals_select_own"
  on public.user_goals for select
  using (user_id = auth.uid());

create policy "goals_insert_own"
  on public.user_goals for insert
  with check (user_id = auth.uid());

create policy "goals_update_own"
  on public.user_goals for update
  using (user_id = auth.uid());

create policy "goals_delete_own"
  on public.user_goals for delete
  using (user_id = auth.uid());

-- Contributions RLS
alter table public.contributions enable row level security;

create policy "contrib_select_own"
  on public.contributions for select
  using (user_id = auth.uid());

create policy "contrib_insert_own"
  on public.contributions for insert
  with check (user_id = auth.uid());

create policy "contrib_update_own"
  on public.contributions for update
  using (user_id = auth.uid());

create policy "contrib_delete_own"
  on public.contributions for delete
  using (user_id = auth.uid());

-- Subscriptions RLS
alter table public.user_subscriptions enable row level security;

create policy "subs_select_own"
  on public.user_subscriptions for select
  using (user_id = auth.uid());

create policy "subs_insert_own"
  on public.user_subscriptions for insert
  with check (user_id = auth.uid());

create policy "subs_update_own"
  on public.user_subscriptions for update
  using (user_id = auth.uid());

-- Streaks RLS
alter table public.streaks enable row level security;

create policy "streaks_select_own"
  on public.streaks for select
  using (user_id = auth.uid());

create policy "streaks_insert_own"
  on public.streaks for insert
  with check (user_id = auth.uid());

create policy "streaks_update_own"
  on public.streaks for update
  using (user_id = auth.uid());

-- Portfolio Holdings RLS
alter table public.portfolio_holdings enable row level security;

create policy "holdings_select_own"
  on public.portfolio_holdings for select
  using (user_id = auth.uid());

create policy "holdings_insert_own"
  on public.portfolio_holdings for insert
  with check (user_id = auth.uid());

create policy "holdings_update_own"
  on public.portfolio_holdings for update
  using (user_id = auth.uid());

create policy "holdings_delete_own"
  on public.portfolio_holdings for delete
  using (user_id = auth.uid());

-- ============================================================
-- AUTH TRIGGER: Automatically initialize new user profile,
-- free subscription, and 0-streak on signup.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display text;
begin
  v_display := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1)
  );

  -- 1. Create Profile Row (with 100 starter ZENS)
  insert into public.profiles (
    id, email, display_name, avatar_url, zens, onboarding_complete
  )
  values (
    new.id,
    new.email,
    v_display,
    new.raw_user_meta_data->>'avatar_url',
    100,
    false
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name),
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);

  -- 2. Create Default Free Subscription
  insert into public.user_subscriptions (
    user_id, entitlement, streak_recovery_tokens, display_name, last_token_reset
  )
  values (
    new.id, 'free', 0, v_display, now()
  )
  on conflict (user_id) do nothing;

  -- 3. Create Default Streak Entry
  insert into public.streaks (
    user_id, current_streak, longest_streak, previous_streak
  )
  values (new.id, 0, 0, 0)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Drop and recreate the trigger on auth.users
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- STORED PROCEDURES / RPC FUNCTIONS
-- ============================================================

-- Monthly streak recovery token refresh for Elite users
create or replace function public.refresh_elite_monthly_streak_tokens(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entitlement  text;
  v_last_reset   timestamp with time zone;
  v_now          timestamp with time zone := now();
begin
  select entitlement, last_token_reset
  into   v_entitlement, v_last_reset
  from   public.user_subscriptions
  where  user_id = p_user_id;

  if v_entitlement = 'elite' and (
    v_last_reset is null
    or date_trunc('month', v_last_reset) < date_trunc('month', v_now)
  ) then
    update public.user_subscriptions
    set    streak_recovery_tokens = 2,
           last_token_reset       = v_now
    where  user_id = p_user_id;
  end if;
end;
$$;

-- Purchase Elite/Pro with ZENS
create or replace function public.purchase_pro_with_zens(
  p_user_id uuid,
  p_cost    integer,
  p_days    integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_zens integer;
  v_new_zens     integer;
  v_expires      timestamptz;
begin
  -- Lock the profile row to prevent a double-spend race condition
  select zens
  into   v_current_zens
  from   public.profiles
  where  id = p_user_id
  for    update;

  if v_current_zens is null then
    raise exception 'Profile not found for user %', p_user_id;
  end if;

  if v_current_zens < p_cost then
    raise exception 'Insufficient ZENS: have %, need %', v_current_zens, p_cost;
  end if;

  v_new_zens := v_current_zens - p_cost;
  v_expires  := now() + (p_days || ' days')::interval;

  -- Deduct ZENS
  update public.profiles
  set    zens = v_new_zens
  where  id   = p_user_id;

  -- Grant Elite
  insert into public.user_subscriptions (user_id, entitlement, expires_at, updated_at)
  values (p_user_id, 'elite', v_expires, now())
  on conflict (user_id) do update
    set entitlement = 'elite',
        expires_at  = greatest(user_subscriptions.expires_at, excluded.expires_at),
        updated_at  = now();

  return jsonb_build_object(
    'zens',       v_new_zens,
    'expires_at', v_expires
  );
end;
$$;

-- Increment streak tokens RPC
create or replace function public.increment_streak_tokens(user_id uuid, amount int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_subscriptions
  set streak_recovery_tokens = streak_recovery_tokens + amount
  where public.user_subscriptions.user_id = $1;
end;
$$;
