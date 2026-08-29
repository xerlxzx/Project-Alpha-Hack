-- Momentum — public-browse RLS policy + gender identity field (Task 1.5)
--
-- 1. Closes the gap flagged in Planning/sdd/reports/task-6.1-report.md:
--    `meetups`' only SELECT policy (0001's meetups_select_member_or_creator)
--    is scoped to a meetup's creator or an existing member, so there was no
--    way for a verified user to browse OTHER users' public "forming"
--    meetups — exactly what PRD §9.14's create/browse flow needs. Adds a
--    genuine browse policy, plus a matching meetup_members read policy so a
--    browsing client can compute "N/size going" without the admin client.
--
--    Note on the predicate: browsability is status = 'forming' AND
--    created_by is not null — BOTH conditions, not OR. Either disjunct alone
--    over-exposes:
--      - `created_by is not null` alone would make every user-created
--        meetup — including confirmed/completed ones with a real
--        membership list — permanently world-readable to any authenticated
--        user, once it's ever been public even briefly.
--      - `status = 'forming'` alone would also expose SYSTEM-generated
--        forming groups (matched-but-not-yet-accepted candidates) to every
--        authenticated user, before the group has confirmed — a direct
--        violation of PRD §9.10's pre-acceptance disclosure staging, which
--        exists precisely to keep an unconfirmed match's group private
--        until quorum accepts.
--    A meetup only needs public visibility while it's an open, joinable,
--    user-created listing; anything else falls back to the existing
--    member/creator-only policy from 0001.
--
-- 2. Adds `preferences.gender` — the user's own gender identity, distinct
--    from the existing `gender_pref` (their filter on *others'* gender).
--    Needed so PRD §9.10's pre-acceptance "gender mix" disclosure can be
--    computed honestly instead of the matcher's current "not tracked"
--    placeholder.

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
