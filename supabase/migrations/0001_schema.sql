-- Project Alpha initial schema (Task 1.1)
-- 14 domain tables + a private, server-only reliability table, with RLS.
--
-- Privacy hard rule (PRD 9.1 / 9.11): no surname, phone number, or home/street
-- address column exists anywhere in this schema. Do not add one in a future
-- migration without re-reading PRD §9.1 and §9.11.
--
-- RLS pattern notes:
-- - `public.is_meetup_member(meetup_id)` is a SECURITY DEFINER helper used to
--   check group membership without triggering RLS self-recursion on
--   meetup_members (the standard Supabase pattern for many-to-many
--   membership checks). It only ever answers a boolean "is auth.uid() a
--   member of this meetup" question. It exposes no row data.
-- - Cross-user profile reads go through the `profile_public` view, not the
--   `profiles` table directly. The base table only grants row access to its
--   owner; the view is the sole path by which a co-member of a CONFIRMED
--   meetup can read the four PRD 9.11 "allowed" fields (first_name,
--   photo_url, university, course_year). The view uses `can_view_profile`
--   instead of `security_invoker` to enforce its column restriction.
-- - `reports` and `user_reliability` carry no participant-facing SELECT
--   policy (PRD 9.12 / 10). Only the service role, which bypasses
--   RLS) can read them.

-- ---------------------------------------------------------------------------
-- Helper: updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  university_email text not null unique,
  is_verified boolean not null default false,
  is_over_18 boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "users_select_own"
on public.users for select
to authenticated
using ( auth.uid() = id );

create policy "users_insert_own"
on public.users for insert
to authenticated
with check ( auth.uid() = id );

create policy "users_update_own"
on public.users for update
to authenticated
using ( auth.uid() = id )
with check ( auth.uid() = id );

-- ---------------------------------------------------------------------------
-- profiles
-- No surname, phone, or address column. Only the fields PRD 9.1 lists.
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  first_name text not null,
  photo_url text,
  age_range text,
  university text not null,
  course_year text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create policy "profiles_select_own"
on public.profiles for select
to authenticated
using ( auth.uid() = user_id );

create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check ( auth.uid() = user_id );

create policy "profiles_update_own"
on public.profiles for update
to authenticated
using ( auth.uid() = user_id )
with check ( auth.uid() = user_id );

-- ---------------------------------------------------------------------------
-- preferences
-- ---------------------------------------------------------------------------

create table public.preferences (
  user_id uuid primary key references public.users (id) on delete cascade,
  travel_km numeric,
  budget_aud numeric,
  hobbies text[] not null default '{}',
  interests text[] not null default '{}',
  gender_pref text,
  language_pref text,
  accessibility text,
  social_energy text,
  weekly_goal int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.preferences enable row level security;

create trigger preferences_set_updated_at
before update on public.preferences
for each row execute function public.set_updated_at();

create policy "preferences_select_own"
on public.preferences for select
to authenticated
using ( auth.uid() = user_id );

create policy "preferences_insert_own"
on public.preferences for insert
to authenticated
with check ( auth.uid() = user_id );

create policy "preferences_update_own"
on public.preferences for update
to authenticated
using ( auth.uid() = user_id )
with check ( auth.uid() = user_id );

-- ---------------------------------------------------------------------------
-- availability_windows
-- ---------------------------------------------------------------------------

create table public.availability_windows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  mode text not null check ( mode in ('im_free', 'plan_ahead') ),
  created_at timestamptz not null default now()
);

create index availability_windows_user_id_idx on public.availability_windows (user_id);

alter table public.availability_windows enable row level security;

create policy "availability_windows_select_own"
on public.availability_windows for select
to authenticated
using ( auth.uid() = user_id );

create policy "availability_windows_insert_own"
on public.availability_windows for insert
to authenticated
with check ( auth.uid() = user_id );

create policy "availability_windows_update_own"
on public.availability_windows for update
to authenticated
using ( auth.uid() = user_id )
with check ( auth.uid() = user_id );

create policy "availability_windows_delete_own"
on public.availability_windows for delete
to authenticated
using ( auth.uid() = user_id );

-- ---------------------------------------------------------------------------
-- meetups
-- ---------------------------------------------------------------------------

create table public.meetups (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'forming' check ( status in ('forming', 'confirmed', 'completed') ),
  quorum int not null default 3,
  size_cap int not null default 6,
  area_lat numeric,
  area_lng numeric,
  scheduled_at timestamptz,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.meetups enable row level security;

-- meetups_select_member_or_creator (which needs is_meetup_member) is added
-- further down once meetup_members exists. is_meetup_member's body is
-- resolved against real relations at CREATE FUNCTION time for `language sql`,
-- so it can't reference meetup_members before that table is created.

create policy "meetups_insert_own"
on public.meetups for insert
to authenticated
with check ( created_by = auth.uid() );

create policy "meetups_update_creator"
on public.meetups for update
to authenticated
using ( created_by = auth.uid() )
with check ( created_by = auth.uid() );

-- ---------------------------------------------------------------------------
-- meetup_members
-- ---------------------------------------------------------------------------

create table public.meetup_members (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references public.meetups (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  accepted boolean not null default false,
  revealed boolean not null default false,
  reroll_used boolean not null default false,
  created_at timestamptz not null default now(),
  unique (meetup_id, user_id)
);

create index meetup_members_meetup_id_idx on public.meetup_members (meetup_id);
create index meetup_members_user_id_idx on public.meetup_members (user_id);

alter table public.meetup_members enable row level security;

create or replace function public.is_meetup_member(target_meetup_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.meetup_members
    where meetup_id = target_meetup_id
      and user_id = auth.uid()
  );
$$;

create policy "meetups_select_member_or_creator"
on public.meetups for select
to authenticated
using ( created_by = auth.uid() or public.is_meetup_member(id) );

create policy "meetup_members_select_self_or_co_member"
on public.meetup_members for select
to authenticated
using ( user_id = auth.uid() or public.is_meetup_member(meetup_id) );

create policy "meetup_members_insert_self"
on public.meetup_members for insert
to authenticated
with check ( user_id = auth.uid() );

create policy "meetup_members_update_self"
on public.meetup_members for update
to authenticated
using ( user_id = auth.uid() )
with check ( user_id = auth.uid() );

-- ---------------------------------------------------------------------------
-- profile_public is the only cross-user profile read path.
-- The view bypasses owner-only RLS and applies its own auth check to expose
-- only the four PRD 9.11 columns.
-- ---------------------------------------------------------------------------

create or replace function public.can_view_profile(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    auth.uid() = target_user_id
    or exists (
      select 1
      from public.meetup_members mm_self
      join public.meetup_members mm_target
        on mm_target.meetup_id = mm_self.meetup_id
      join public.meetups m
        on m.id = mm_self.meetup_id
      where mm_self.user_id = auth.uid()
        and mm_target.user_id = target_user_id
        and m.status = 'confirmed'
    );
$$;

create view public.profile_public
with (security_invoker = false)
as
select user_id, first_name, photo_url, university, course_year
from public.profiles
where public.can_view_profile(user_id);

grant select on public.profile_public to authenticated;

-- ---------------------------------------------------------------------------
-- reports are participant-invisible (PRD 10). Insert-only for the reporter;
-- no SELECT/UPDATE/DELETE policy exists for authenticated at all.
-- ---------------------------------------------------------------------------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null references public.users (id) on delete cascade,
  reported uuid not null references public.users (id) on delete cascade,
  meetup_id uuid references public.meetups (id) on delete set null,
  category text not null,
  detail text,
  status text not null default 'open' check ( status in ('open', 'review') ),
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;

create policy "reports_insert_reporter"
on public.reports for insert
to authenticated
with check ( reporter = auth.uid() );

-- ---------------------------------------------------------------------------
-- activity_recommendations
-- ---------------------------------------------------------------------------

create table public.activity_recommendations (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references public.meetups (id) on delete cascade,
  place_id text,
  venue_name text,
  activity_title text,
  reason text,
  est_cost_aud numeric,
  est_distance_km numeric,
  over_budget_pref boolean not null default false,
  over_distance_pref boolean not null default false,
  booking_url text,
  source text not null check ( source in ('live', 'fallback') ),
  raw_places_json jsonb,
  created_at timestamptz not null default now()
);

create index activity_recommendations_meetup_id_idx on public.activity_recommendations (meetup_id);

alter table public.activity_recommendations enable row level security;

create policy "activity_recommendations_select_member"
on public.activity_recommendations for select
to authenticated
using ( public.is_meetup_member(meetup_id) );

-- Writes come only from the server (venue agent), via the service role,
-- which bypasses RLS. Authenticated users have no insert/update policy.

-- ---------------------------------------------------------------------------
-- chat_messages
-- ---------------------------------------------------------------------------

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references public.meetups (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index chat_messages_meetup_id_idx on public.chat_messages (meetup_id, created_at);

alter table public.chat_messages enable row level security;

create policy "chat_messages_select_member"
on public.chat_messages for select
to authenticated
using ( public.is_meetup_member(meetup_id) );

create policy "chat_messages_insert_member"
on public.chat_messages for insert
to authenticated
with check ( user_id = auth.uid() and public.is_meetup_member(meetup_id) );

-- ---------------------------------------------------------------------------
-- feedback is one-directional. Only the author can read their submission;
-- the subject never sees it.
-- ---------------------------------------------------------------------------

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references public.meetups (id) on delete cascade,
  from_user uuid not null references public.users (id) on delete cascade,
  about_user uuid references public.users (id) on delete set null,
  group_reaction text,
  meet_again boolean,
  avoid_rematch boolean,
  note text,
  safety_report_id uuid references public.reports (id) on delete set null,
  created_at timestamptz not null default now()
);

create index feedback_meetup_id_idx on public.feedback (meetup_id);

alter table public.feedback enable row level security;

create policy "feedback_select_own"
on public.feedback for select
to authenticated
using ( from_user = auth.uid() );

create policy "feedback_insert_own"
on public.feedback for insert
to authenticated
with check ( from_user = auth.uid() );

-- ---------------------------------------------------------------------------
-- friendships are created server-side when both sides pick "meet again";
-- participants can only read, not write.
-- ---------------------------------------------------------------------------

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.users (id) on delete cascade,
  user_b uuid not null references public.users (id) on delete cascade,
  via_meetup uuid references public.meetups (id) on delete set null,
  created_at timestamptz not null default now(),
  check ( user_a <> user_b ),
  unique (user_a, user_b)
);

alter table public.friendships enable row level security;

create policy "friendships_select_participant"
on public.friendships for select
to authenticated
using ( auth.uid() = user_a or auth.uid() = user_b );

-- ---------------------------------------------------------------------------
-- blocks are visible only to the blocker.
-- ---------------------------------------------------------------------------

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker uuid not null references public.users (id) on delete cascade,
  blocked uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check ( blocker <> blocked ),
  unique (blocker, blocked)
);

alter table public.blocks enable row level security;

create policy "blocks_select_own"
on public.blocks for select
to authenticated
using ( blocker = auth.uid() );

create policy "blocks_insert_own"
on public.blocks for insert
to authenticated
with check ( blocker = auth.uid() );

create policy "blocks_delete_own"
on public.blocks for delete
to authenticated
using ( blocker = auth.uid() );

-- ---------------------------------------------------------------------------
-- momentum_events are computed from confirmed attendance and readable
-- by the owning user.
-- ---------------------------------------------------------------------------

create table public.momentum_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  activity_id uuid references public.activity_recommendations (id) on delete set null,
  week int not null,
  completed_at timestamptz,
  hours numeric,
  created_at timestamptz not null default now()
);

create index momentum_events_user_id_idx on public.momentum_events (user_id);

alter table public.momentum_events enable row level security;

create policy "momentum_events_select_own"
on public.momentum_events for select
to authenticated
using ( user_id = auth.uid() );

-- ---------------------------------------------------------------------------
-- badges are awarded server-side and readable by the owner.
-- ---------------------------------------------------------------------------

create table public.badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  code text not null,
  earned_at timestamptz not null default now(),
  unique (user_id, code)
);

create index badges_user_id_idx on public.badges (user_id);

alter table public.badges enable row level security;

create policy "badges_select_own"
on public.badges for select
to authenticated
using ( user_id = auth.uid() );

-- ---------------------------------------------------------------------------
-- user_reliability stores the private score (PRD 9.12). No policy of any
-- kind: RLS is enabled with zero grants to anon/authenticated, so this table
-- is reachable only by the service role. Never expose to participants.
-- ---------------------------------------------------------------------------

create table public.user_reliability (
  user_id uuid primary key references public.users (id) on delete cascade,
  score numeric not null default 100,
  updated_at timestamptz not null default now()
);

alter table public.user_reliability enable row level security;

create trigger user_reliability_set_updated_at
before update on public.user_reliability
for each row execute function public.set_updated_at();
