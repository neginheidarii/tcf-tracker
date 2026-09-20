-- Study tracker schema.
--
-- Two ideas shape this. First, a task is its own row rather than part of a
-- day-sized blob, so two devices editing different tasks never collide and a
-- single tick is a single write. Second, every table carries user_id so row
-- level security is a direct comparison against auth.uid() instead of a join.
--
-- Small fixed maps (targets, baselines, templates) stay as jsonb on the plan:
-- they are always read and written together, and are edited from one screen.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- helpers

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- profiles

create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- plans

create table public.plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  start_date  date not null,
  exam_date   date not null,
  theme       text not null default 'light' check (theme in ('light', 'dark', 'auto')),
  -- how much of each bank you are aiming to cover
  targets     jsonb not null,
  -- questions and sujets already covered before the plan began
  baselines   jsonb not null,
  -- null means "use the defaults that ship with the app"
  templates   jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- one plan per account for now; the shape allows more without a migration
create unique index plans_one_per_user on public.plans (user_id);

-- ---------------------------------------------------------------- days

create table public.days (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  plan_id       uuid not null references public.plans on delete cascade,
  on_date       date not null,
  template_kind text check (template_kind in ('chill', 'productive')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (plan_id, on_date)
);

create index days_user_date on public.days (user_id, on_date);

-- ---------------------------------------------------------------- tasks

create table public.tasks (
  -- the client generates this so a task can be created with no connection
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  plan_id       uuid not null references public.plans on delete cascade,
  on_date       date not null,
  -- the template row this came from, if it still tracks one
  tid           text,
  block         text not null check (block in ('commute', 'study1', 'pause', 'evening', 'close', 'custom')),
  at_time       time not null,
  kind          text not null check (kind in ('CO', 'CE', 'EO', 'EE', 'REVIEW', 'PAUSE', 'BILAN', 'MOCK', 'ERREUR')),
  title         text not null,
  target        integer not null check (target > 0),
  actual        integer not null default 0 check (actual >= 0),
  spent         integer not null default 0 check (spent >= 0),
  unit          text not null,
  mins          integer not null default 0 check (mins >= 0),
  bank_skill    text check (bank_skill in ('CO', 'CE', 'EO', 'EE')),
  bank_key      text,
  status        text not null default 'pending' check (status in ('pending', 'partial', 'done', 'skipped')),
  from_template text check (from_template in ('chill', 'productive')),
  -- how many times this has been pushed to a later day
  rolled_from   integer not null default 0 check (rolled_from >= 0),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- a bank reference is either complete or absent
  constraint tasks_bank_complete check ((bank_skill is null) = (bank_key is null))
);

create index tasks_user_date on public.tasks (user_id, on_date);
create index tasks_plan on public.tasks (plan_id);

-- ---------------------------------------------------------------- updated_at

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger plans_touch before update on public.plans
  for each row execute function public.touch_updated_at();
create trigger days_touch before update on public.days
  for each row execute function public.touch_updated_at();
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- security

alter table public.profiles enable row level security;
alter table public.plans    enable row level security;
alter table public.days     enable row level security;
alter table public.tasks    enable row level security;

create policy "profiles are private" on public.profiles
  for all to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "plans are private" on public.plans
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "days are private" on public.days
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "tasks are private" on public.tasks
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------- bootstrap

-- A new account arrives with a profile and a usable plan already in place, so
-- the app has something to read on first load even with a poor connection.
-- The dates come from the server's clock; the client nudges them to the
-- device's own date while the plan is still untouched.
create or replace function public.bootstrap_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'display_name', ''));

  insert into public.plans (user_id, start_date, exam_date, targets, baselines)
  values (
    new.id,
    current_date,
    current_date + 74,
    '{"CO": 1189, "CE": 1154, "EO": 120, "EE": 242}'::jsonb,
    '{"CO": {"A1": 133, "A2": 175, "B1": 0, "B2": 0, "C1": 0, "C2": 0},
      "CE": {"A1": 0, "A2": 0, "B1": 0, "B2": 0, "C1": 0, "C2": 0},
      "EO": {"1": 0, "2": 0, "3": 0},
      "EE": {"1": 0, "2": 0, "3": 0}}'::jsonb
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.bootstrap_user();

-- ---------------------------------------------------------------- realtime

-- Changes on these tables are pushed to other signed-in devices. Row level
-- security still applies, so a client only ever receives its own rows.
alter publication supabase_realtime add table public.plans;
alter publication supabase_realtime add table public.days;
alter publication supabase_realtime add table public.tasks;

-- A delete normally carries only the primary key in its "old" record, so a
-- subscription filtered on user_id can never match one and other devices never
-- learn that a task was removed. Replicating the whole row fixes that. The
-- extra write-ahead log volume is immaterial at the size of a study plan.
alter table public.tasks replica identity full;
alter table public.days  replica identity full;
