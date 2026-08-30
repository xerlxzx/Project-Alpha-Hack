-- Recurring groups: after a meetup completes, members who want to keep
-- meeting can be promoted into a persistent group. The group gets a fresh
-- weekly recommendation via the existing venue-agent, reusing the meetups /
-- meetup_members machinery rather than inventing a parallel scheduling model.

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  origin_meetup_id uuid references public.meetups (id) on delete set null,
  status text not null default 'active' check ( status in ('active', 'disbanded') ),
  created_at timestamptz not null default now()
);

alter table public.groups enable row level security;

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'active' check ( status in ('active', 'left') ),
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create index group_members_group_id_idx on public.group_members (group_id);
create index group_members_user_id_idx on public.group_members (user_id);

alter table public.group_members enable row level security;

create or replace function public.is_group_member(target_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = target_group_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create policy "groups_select_member"
on public.groups for select
to authenticated
using ( public.is_group_member(id) );

create policy "group_members_select_self_or_co_member"
on public.group_members for select
to authenticated
using ( user_id = auth.uid() or public.is_group_member(group_id) );

-- Writes come only from the server (continue-vote / plan-week routes), via
-- the service role, which bypasses RLS -- same convention as
-- activity_recommendations. Authenticated users have no insert/update policy.

-- A meetup optionally belongs to a recurring group (set once the group is
-- confirmed, or from creation for a group's own weekly meetups).
alter table public.meetups
  add column group_id uuid references public.groups (id) on delete set null;

create index meetups_group_id_idx on public.meetups (group_id);

-- Per-member "stay in this group?" vote, collected right after feedback.
-- Null = undecided.
alter table public.meetup_members
  add column continue_vote boolean;
