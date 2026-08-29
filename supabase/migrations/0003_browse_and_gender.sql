-- Momentum public-browse RLS and gender identity (Task 1.5)
--
-- 1. Adds the PRD §9.14 browse policy missing from 0001, plus member reads
--    needed to compute "N/size going."
--
--    Both predicates are required. `created_by is not null` alone exposes
--    completed membership lists. `status = 'forming'` alone exposes private
--    system-generated groups before PRD §9.10 quorum.
--
-- 2. Adds `preferences.gender` for the PRD §9.10 gender-mix disclosure.
--    `gender_pref` remains the filter on other users.

create policy "meetups_select_browsable"
on public.meetups for select
to authenticated
using ( status = 'forming' and created_by is not null );

create policy "meetup_members_select_browsable"
on public.meetup_members for select
to authenticated
using (
  exists (
    select 1
    from public.meetups m
    where m.id = meetup_members.meetup_id
      and m.status = 'forming'
      and m.created_by is not null
  )
);

alter table public.preferences
  add column gender text;
