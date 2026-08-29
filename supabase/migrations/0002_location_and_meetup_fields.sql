-- Momentum location and user-meetup fields (Task 1.4)
--
-- Fills two gaps flagged in Planning/sdd/reports/task-1.2-report.md:
-- 1. `preferences` had no approximate-location column at all (PRD §9.2
--    requires it at onboarding; PRD §9.8's venue agent needs a group
--    centroid computed from member locations).
-- 2. `meetups` had nowhere to store a user-created meetup's pre-recommendation
--    intent/tags/cost range (PRD §9.14).
-- Both additions are nullable, so existing rows and app code that
-- only knows the 0001 columns keep working unchanged.

alter table public.preferences
  add column area_lat double precision,
  add column area_lng double precision;

alter table public.meetups
  add column activity_intent text,
  add column tags text[],
  add column cost_min integer,
  add column cost_max integer;
