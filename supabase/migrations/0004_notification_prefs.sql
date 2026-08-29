-- Notification preference toggles for the profile settings redesign.
--
-- Flags only: no push notification delivery exists anywhere in this
-- codebase yet (no service worker registration, no subscription table). The
-- settings UI persists a real, honest choice for whenever that's built.

alter table public.preferences
  add column notify_match_found boolean not null default true,
  add column notify_meetup_reminders boolean not null default true,
  add column notify_weekly_summary boolean not null default false;
