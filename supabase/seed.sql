-- Momentum demo seed data (Task 1.2, extended by Task 1.4 and 1.5)
-- Builds on supabase/migrations/0001_schema.sql, 0002_location_and_meetup_fields.sql
-- (area_lat/area_lng on preferences; activity_intent/tags/cost_min/cost_max
-- on meetups), and 0003_browse_and_gender.sql (preferences.gender). Run
-- this AFTER all three, with a service-role/superuser connection (it
-- inserts into auth.users/auth.identities directly, and the service role
-- bypasses RLS on every public.* table so the inserts below don't need to
-- satisfy any policy).
--
-- Fixed UUID scheme (all under one root so they're easy to recognise/grep):
--   Users            00000000-0000-0000-0001-0000000000NN   NN = 01..12 (01 = active demo user)
--   Auth identities   00000000-0000-0000-0002-0000000000NN   mirrors the user NN
--   Meetups           00000000-0000-0000-0003-0000000000NN   01 confirmed · 02 completed (past) · 03-05 user-created A/B/C
--   Activity recs      00000000-0000-0000-0004-0000000000NN  01 confirmed-meetup rec · 02 completed-meetup rec · 03-05 meetup A/B/C recs
--   Chat messages       00000000-0000-0000-0005-0000000000NN 01..06 on the confirmed meetup
--   Feedback             00000000-0000-0000-0006-0000000000NN 01/02 mutual "meet again"
--   Friendship             00000000-0000-0000-0007-000000000001
--   Availability windows   00000000-0000-0000-0008-0000000000NN  matches user NN
--   Momentum event          00000000-0000-0000-0009-000000000001
--
-- ACTIVE DEMO USER  = 00000000-0000-0000-0001-000000000001  (Alex Chen)
-- CONFIRMED MEETUP  = 00000000-0000-0000-0003-000000000001  (Pickup Basketball + Bites, Victoria Park)
-- Other tasks/tests should reference these two ids directly rather than
-- re-deriving "the demo user" by querying for one.
--
-- Overlap design (PRD §18 "understandable without being perfectly
-- identical"): the active user's interests are basketball, food exploration,
-- casual outdoor. Users 02-05 each share exactly one or two of those three
-- with the active user (see comments on each profile below); users 06-12
-- share none of the three, to keep the pool varied rather than uniform.
--
-- Idempotency: every insert targets a fixed literal id (or, where the table
-- has a meaningful natural key, that key) with `on conflict ... do nothing`,
-- so re-running this file is safe.

-- ---------------------------------------------------------------------------
-- auth.users / auth.identities. FK target for public.users.id. Demo-only:
-- these accounts are not meant to be logged into via password; the encrypted
-- password is a throwaway value satisfying the NOT NULL constraint. Only the
-- active demo user is expected to ever authenticate for real, via the app's
-- actual signup/verification flow, which would upsert over this row.
-- Depends on pgcrypto's crypt()/gen_salt() being reachable (Supabase hosted
-- projects expose it via the `extensions` schema by default); if the target
-- project has it elsewhere, adjust the two calls below accordingly.
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0001-000000000001', 'authenticated', 'authenticated', 'alex.chen@usyd.edu.au', extensions.crypt('DemoPass!2026', extensions.gen_salt('bf')), now(), now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Alex"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0001-000000000002', 'authenticated', 'authenticated', 'maya.singh@usyd.edu.au', extensions.crypt('DemoPass!2026', extensions.gen_salt('bf')), now(), now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Maya"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0001-000000000003', 'authenticated', 'authenticated', 'jordan.lee@student.unsw.edu.au', extensions.crypt('DemoPass!2026', extensions.gen_salt('bf')), now(), now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Jordan"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0001-000000000004', 'authenticated', 'authenticated', 'priya.nair@usyd.edu.au', extensions.crypt('DemoPass!2026', extensions.gen_salt('bf')), now(), now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Priya"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0001-000000000005', 'authenticated', 'authenticated', 'sam.okafor@student.uts.edu.au', extensions.crypt('DemoPass!2026', extensions.gen_salt('bf')), now(), now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Sam"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0001-000000000006', 'authenticated', 'authenticated', 'tom.nguyen@usyd.edu.au', extensions.crypt('DemoPass!2026', extensions.gen_salt('bf')), now(), now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Tom"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0001-000000000007', 'authenticated', 'authenticated', 'grace.kim@student.unsw.edu.au', extensions.crypt('DemoPass!2026', extensions.gen_salt('bf')), now(), now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Grace"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0001-000000000008', 'authenticated', 'authenticated', 'liam.obrien@usyd.edu.au', extensions.crypt('DemoPass!2026', extensions.gen_salt('bf')), now(), now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Liam"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0001-000000000009', 'authenticated', 'authenticated', 'aisha.rahman@student.uts.edu.au', extensions.crypt('DemoPass!2026', extensions.gen_salt('bf')), now(), now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Aisha"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0001-000000000010', 'authenticated', 'authenticated', 'ben.torres@student.unsw.edu.au', extensions.crypt('DemoPass!2026', extensions.gen_salt('bf')), now(), now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Ben"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0001-000000000011', 'authenticated', 'authenticated', 'chloe.zhang@usyd.edu.au', extensions.crypt('DemoPass!2026', extensions.gen_salt('bf')), now(), now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Chloe"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0001-000000000012', 'authenticated', 'authenticated', 'noah.williams@student.unsw.edu.au', extensions.crypt('DemoPass!2026', extensions.gen_salt('bf')), now(), now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Noah"}', now(), now(), '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0001-000000000001', jsonb_build_object('sub', '00000000-0000-0000-0001-000000000001', 'email', 'alex.chen@usyd.edu.au'), 'email', now(), now(), now()),
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0001-000000000002', jsonb_build_object('sub', '00000000-0000-0000-0001-000000000002', 'email', 'maya.singh@usyd.edu.au'), 'email', now(), now(), now()),
  ('00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0001-000000000003', jsonb_build_object('sub', '00000000-0000-0000-0001-000000000003', 'email', 'jordan.lee@student.unsw.edu.au'), 'email', now(), now(), now()),
  ('00000000-0000-0000-0002-000000000004', '00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0001-000000000004', jsonb_build_object('sub', '00000000-0000-0000-0001-000000000004', 'email', 'priya.nair@usyd.edu.au'), 'email', now(), now(), now()),
  ('00000000-0000-0000-0002-000000000005', '00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0001-000000000005', jsonb_build_object('sub', '00000000-0000-0000-0001-000000000005', 'email', 'sam.okafor@student.uts.edu.au'), 'email', now(), now(), now()),
  ('00000000-0000-0000-0002-000000000006', '00000000-0000-0000-0001-000000000006', '00000000-0000-0000-0001-000000000006', jsonb_build_object('sub', '00000000-0000-0000-0001-000000000006', 'email', 'tom.nguyen@usyd.edu.au'), 'email', now(), now(), now()),
  ('00000000-0000-0000-0002-000000000007', '00000000-0000-0000-0001-000000000007', '00000000-0000-0000-0001-000000000007', jsonb_build_object('sub', '00000000-0000-0000-0001-000000000007', 'email', 'grace.kim@student.unsw.edu.au'), 'email', now(), now(), now()),
  ('00000000-0000-0000-0002-000000000008', '00000000-0000-0000-0001-000000000008', '00000000-0000-0000-0001-000000000008', jsonb_build_object('sub', '00000000-0000-0000-0001-000000000008', 'email', 'liam.obrien@usyd.edu.au'), 'email', now(), now(), now()),
  ('00000000-0000-0000-0002-000000000009', '00000000-0000-0000-0001-000000000009', '00000000-0000-0000-0001-000000000009', jsonb_build_object('sub', '00000000-0000-0000-0001-000000000009', 'email', 'aisha.rahman@student.uts.edu.au'), 'email', now(), now(), now()),
  ('00000000-0000-0000-0002-000000000010', '00000000-0000-0000-0001-000000000010', '00000000-0000-0000-0001-000000000010', jsonb_build_object('sub', '00000000-0000-0000-0001-000000000010', 'email', 'ben.torres@student.unsw.edu.au'), 'email', now(), now(), now()),
  ('00000000-0000-0000-0002-000000000011', '00000000-0000-0000-0001-000000000011', '00000000-0000-0000-0001-000000000011', jsonb_build_object('sub', '00000000-0000-0000-0001-000000000011', 'email', 'chloe.zhang@usyd.edu.au'), 'email', now(), now(), now()),
  ('00000000-0000-0000-0002-000000000012', '00000000-0000-0000-0001-000000000012', '00000000-0000-0000-0001-000000000012', jsonb_build_object('sub', '00000000-0000-0000-0001-000000000012', 'email', 'noah.williams@student.unsw.edu.au'), 'email', now(), now(), now())
on conflict (provider, provider_id) do nothing;

-- ---------------------------------------------------------------------------
-- public.users
-- ---------------------------------------------------------------------------

insert into public.users (id, university_email, is_verified, is_over_18) values
  ('00000000-0000-0000-0001-000000000001', 'alex.chen@usyd.edu.au', true, true),
  ('00000000-0000-0000-0001-000000000002', 'maya.singh@usyd.edu.au', true, true),
  ('00000000-0000-0000-0001-000000000003', 'jordan.lee@student.unsw.edu.au', true, true),
  ('00000000-0000-0000-0001-000000000004', 'priya.nair@usyd.edu.au', true, true),
  ('00000000-0000-0000-0001-000000000005', 'sam.okafor@student.uts.edu.au', true, true),
  ('00000000-0000-0000-0001-000000000006', 'tom.nguyen@usyd.edu.au', true, true),
  ('00000000-0000-0000-0001-000000000007', 'grace.kim@student.unsw.edu.au', true, true),
  ('00000000-0000-0000-0001-000000000008', 'liam.obrien@usyd.edu.au', true, true),
  ('00000000-0000-0000-0001-000000000009', 'aisha.rahman@student.uts.edu.au', true, true),
  ('00000000-0000-0000-0001-000000000010', 'ben.torres@student.unsw.edu.au', true, true),
  ('00000000-0000-0000-0001-000000000011', 'chloe.zhang@usyd.edu.au', true, true),
  ('00000000-0000-0000-0001-000000000012', 'noah.williams@student.unsw.edu.au', true, true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- public.profiles: first_name, photo_url, age_range, university,
-- course_year only (no surname/phone/address columns exist to fill).
-- ---------------------------------------------------------------------------

insert into public.profiles (user_id, first_name, photo_url, age_range, university, course_year) values
  ('00000000-0000-0000-0001-000000000001', 'Alex',  'https://i.pravatar.cc/300?img=1',  '21-23', 'University of Sydney', 'Computer Science, Year 3'),
  ('00000000-0000-0000-0001-000000000002', 'Maya',  'https://i.pravatar.cc/300?img=5',  '18-20', 'University of Sydney', 'Business, Year 2'),
  ('00000000-0000-0000-0001-000000000003', 'Jordan','https://i.pravatar.cc/300?img=12', '24-26', 'UNSW Sydney', 'Engineering, Year 4'),
  ('00000000-0000-0000-0001-000000000004', 'Priya', 'https://i.pravatar.cc/300?img=9',  '18-20', 'University of Sydney', 'Psychology, Year 1'),
  ('00000000-0000-0000-0001-000000000005', 'Sam',   'https://i.pravatar.cc/300?img=15', '21-23', 'UTS', 'Design, Year 3'),
  ('00000000-0000-0000-0001-000000000006', 'Tom',   'https://i.pravatar.cc/300?img=33', '18-20', 'University of Sydney', 'Law, Year 2'),
  ('00000000-0000-0000-0001-000000000007', 'Grace', 'https://i.pravatar.cc/300?img=24', '24-26', 'UNSW Sydney', 'Medicine, Year 5'),
  ('00000000-0000-0000-0001-000000000008', 'Liam',  'https://i.pravatar.cc/300?img=51', '21-23', 'University of Sydney', 'Arts, Year 3'),
  ('00000000-0000-0000-0001-000000000009', 'Aisha', 'https://i.pravatar.cc/300?img=47', '18-20', 'UTS', 'IT, Year 2'),
  ('00000000-0000-0000-0001-000000000010', 'Ben',   'https://i.pravatar.cc/300?img=59', '18-20', 'UNSW Sydney', 'Business, Year 1'),
  ('00000000-0000-0000-0001-000000000011', 'Chloe', 'https://i.pravatar.cc/300?img=44', '21-23', 'University of Sydney', 'Commerce, Year 3'),
  ('00000000-0000-0000-0001-000000000012', 'Noah',  'https://i.pravatar.cc/300?img=68', '24-26', 'UNSW Sydney', 'Physics, Year 4')
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- public.preferences
-- Overlap with the active user's basketball / food exploration / casual
-- outdoor for users 02-05; users 06-12 do not overlap.
-- area_lat/area_lng (added by 0002) are real approximate coordinates spread
-- around inner Sydney to vary PRD §9.6 travel-distance matching.
-- The active user sits at USyd Camperdown; distances below are approximate
-- straight-line km from there, roughly consistent with each user's
-- travel_km tolerance.
-- ---------------------------------------------------------------------------

insert into public.preferences (
  user_id, travel_km, budget_aud, hobbies, interests, gender_pref, language_pref,
  accessibility, social_energy, weekly_goal, area_lat, area_lng
) values
  -- Active user: USyd Camperdown (0 km reference)
  ('00000000-0000-0000-0001-000000000001', 10, 30, ARRAY['basketball','hiking','photography'], ARRAY['basketball','food exploration','casual outdoor'], 'any', 'English', null, 'medium', 2, -33.8886, 151.1873),
  -- Basketball + food exploration overlap. Redfern (~1.5 km)
  ('00000000-0000-0000-0001-000000000002', 8, 35, ARRAY['basketball','dancing'], ARRAY['basketball','food exploration','live music'], 'any', 'English', null, 'high', 3, -33.8930, 151.2000),
  -- Food exploration + casual outdoor overlap. Kensington (~5 km)
  ('00000000-0000-0000-0001-000000000003', 15, 25, ARRAY['hiking','cooking'], ARRAY['food exploration','casual outdoor','hiking'], 'any', 'English', null, 'medium', 1, -33.9173, 151.2313),
  -- Basketball + casual outdoor overlap. Newtown (~1.5 km)
  ('00000000-0000-0000-0001-000000000004', 12, 20, ARRAY['basketball','reading'], ARRAY['basketball','casual outdoor','board games'], 'women', 'English, Hindi', null, 'medium', 2, -33.8983, 151.1784),
  -- Food exploration overlap. Ultimo (~2 km)
  ('00000000-0000-0000-0001-000000000005', 6, 40, ARRAY['cooking','sketching'], ARRAY['food exploration','coffee culture','art'], 'any', 'English', null, 'low', 1, -33.8830, 151.2005),
  -- No overlap. Glebe (~1 km)
  ('00000000-0000-0000-0001-000000000006', 5, 15, ARRAY['chess','debate'], ARRAY['board games','trivia','study groups'], 'any', 'English, Vietnamese', null, 'low', 1, -33.8799, 151.1852),
  -- Kensington, near UNSW/hospital (~5.5 km)
  ('00000000-0000-0000-0001-000000000007', 20, 45, ARRAY['yoga','running'], ARRAY['hiking','yoga','wellness'], 'women', 'English, Korean', null, 'medium', 3, -33.9200, 151.2280),
  -- Chippendale (~1 km)
  ('00000000-0000-0000-0001-000000000008', 10, 50, ARRAY['guitar','vinyl collecting'], ARRAY['live music','gigs','coffee culture'], 'any', 'English', null, 'high', 2, -33.8850, 151.1975),
  -- Ultimo (~2 km)
  ('00000000-0000-0000-0001-000000000009', 7, 20, ARRAY['gaming','drawing'], ARRAY['gaming','board games','anime'], 'women', 'English, Bengali', 'wheelchair access needed', 'low', 1, -33.8820, 151.1990),
  -- Kensington, near UNSW (~5 km)
  ('00000000-0000-0000-0001-000000000010', 15, 30, ARRAY['gym','football'], ARRAY['gym','sports','fitness'], 'any', 'English, Spanish', null, 'high', 4, -33.9150, 151.2250),
  -- Surry Hills (~2.3 km)
  ('00000000-0000-0000-0001-000000000011', 8, 25, ARRAY['photography','baking'], ARRAY['coffee culture','study groups','photography'], 'any', 'English, Mandarin', null, 'medium', 2, -33.8845, 151.2110),
  -- Coogee is farthest out (~7 km) with higher travel tolerance.
  ('00000000-0000-0000-0001-000000000012', 25, 20, ARRAY['hiking','stargazing'], ARRAY['hiking','astronomy','board games'], 'men', 'English', null, 'low', 1, -33.9205, 151.2544)
on conflict (user_id) do nothing;

-- public.preferences.gender (added by 0003) stores the user's gender
-- identity, varied across the 12 profiles (PRD §18's "gender" axis and
-- §9.10's "gender mix" disclosure both need this, distinct from gender_pref
-- which is a filter on others). Written as UPDATEs, not folded into the
-- INSERT above, so this backfills rows that were seeded before 0003 existed
-- and safely targets fixed user_ids on reruns.
update public.preferences set gender = 'man' where user_id = '00000000-0000-0000-0001-000000000001';
update public.preferences set gender = 'woman' where user_id = '00000000-0000-0000-0001-000000000002';
update public.preferences set gender = 'man' where user_id = '00000000-0000-0000-0001-000000000003';
update public.preferences set gender = 'woman' where user_id = '00000000-0000-0000-0001-000000000004';
update public.preferences set gender = 'non-binary' where user_id = '00000000-0000-0000-0001-000000000005';
update public.preferences set gender = 'man' where user_id = '00000000-0000-0000-0001-000000000006';
update public.preferences set gender = 'woman' where user_id = '00000000-0000-0000-0001-000000000007';
update public.preferences set gender = 'man' where user_id = '00000000-0000-0000-0001-000000000008';
update public.preferences set gender = 'woman' where user_id = '00000000-0000-0000-0001-000000000009';
update public.preferences set gender = 'man' where user_id = '00000000-0000-0000-0001-000000000010';
update public.preferences set gender = 'woman' where user_id = '00000000-0000-0000-0001-000000000011';
update public.preferences set gender = 'man' where user_id = '00000000-0000-0000-0001-000000000012';

-- ---------------------------------------------------------------------------
-- public.user_reliability is private with no client RLS policy.
-- varied scores, including one visibly reduced by a past late cancellation.
-- ---------------------------------------------------------------------------

insert into public.user_reliability (user_id, score) values
  ('00000000-0000-0000-0001-000000000001', 96),
  ('00000000-0000-0000-0001-000000000002', 100),
  ('00000000-0000-0000-0001-000000000003', 91),
  ('00000000-0000-0000-0001-000000000004', 100),
  ('00000000-0000-0000-0001-000000000005', 88),
  ('00000000-0000-0000-0001-000000000006', 100),
  ('00000000-0000-0000-0001-000000000007', 97),
  ('00000000-0000-0000-0001-000000000008', 73),
  ('00000000-0000-0000-0001-000000000009', 100),
  ('00000000-0000-0000-0001-000000000010', 100),
  ('00000000-0000-0000-0001-000000000011', 95),
  ('00000000-0000-0000-0001-000000000012', 62)
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- public.availability_windows mixes PRD 9.4 "im_free" and "plan_ahead" rows.
-- ---------------------------------------------------------------------------

insert into public.availability_windows (id, user_id, start_at, end_at, mode) values
  ('00000000-0000-0000-0008-000000000001', '00000000-0000-0000-0001-000000000001', now(), now() + interval '6 hours', 'im_free'),
  ('00000000-0000-0000-0008-000000000002', '00000000-0000-0000-0001-000000000002', now(), now() + interval '5 hours', 'im_free'),
  ('00000000-0000-0000-0008-000000000003', '00000000-0000-0000-0001-000000000003', now(), now() + interval '7 hours', 'im_free'),
  ('00000000-0000-0000-0008-000000000004', '00000000-0000-0000-0001-000000000004', now(), now() + interval '6 hours', 'im_free'),
  ('00000000-0000-0000-0008-000000000005', '00000000-0000-0000-0001-000000000005', now(), now() + interval '4 hours', 'im_free'),
  ('00000000-0000-0000-0008-000000000006', '00000000-0000-0000-0001-000000000006', now() + interval '2 days', now() + interval '2 days 4 hours', 'plan_ahead'),
  ('00000000-0000-0000-0008-000000000007', '00000000-0000-0000-0001-000000000007', now() + interval '3 days', now() + interval '3 days 3 hours', 'plan_ahead'),
  ('00000000-0000-0000-0008-000000000008', '00000000-0000-0000-0001-000000000008', now() + interval '4 days', now() + interval '4 days 5 hours', 'plan_ahead'),
  ('00000000-0000-0000-0008-000000000009', '00000000-0000-0000-0001-000000000009', now() + interval '2 days', now() + interval '2 days 3 hours', 'plan_ahead'),
  ('00000000-0000-0000-0008-000000000010', '00000000-0000-0000-0001-000000000010', now(), now() + interval '8 hours', 'im_free'),
  ('00000000-0000-0000-0008-000000000011', '00000000-0000-0000-0001-000000000011', now() + interval '6 days', now() + interval '6 days 3 hours', 'plan_ahead'),
  ('00000000-0000-0000-0008-000000000012', '00000000-0000-0000-0001-000000000012', now() + interval '5 days', now() + interval '5 days 4 hours', 'plan_ahead')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- public.meetups
-- 01 confirmed (system-generated, created_by null)
-- 02 completed (past, for the active user's Momentum history)
-- 03-05 user-created ("cards"), each forming, each hosted by a different user
-- ---------------------------------------------------------------------------

-- activity_intent/tags/cost_min/cost_max (added by 0002) are only meaningful
-- for the user-created cards (03-05, PRD §9.14); the system-generated
-- meetups (01-02) leave them null. Their intent comes from the matcher, not a
-- host's, and it's already captured by their activity_recommendations row.
insert into public.meetups (
  id, status, quorum, size_cap, area_lat, area_lng, scheduled_at, created_by,
  activity_intent, tags, cost_min, cost_max
) values
  ('00000000-0000-0000-0003-000000000001', 'confirmed', 3, 6, -33.8886, 151.1873, now() + interval '3 hours', null, null, null, null, null),
  ('00000000-0000-0000-0003-000000000002', 'completed', 3, 6, -33.8950, 151.1795, now() - interval '10 days', null, null, null, null, null),
  ('00000000-0000-0000-0003-000000000003', 'forming',   3, 5, -33.8845, 151.1925, now() + interval '2 days', '00000000-0000-0000-0001-000000000006', 'Board game café night — bring your competitive spirit', ARRAY['board games','trivia'], 10, 20),
  ('00000000-0000-0000-0003-000000000004', 'forming',   3, 6, -33.8836, 151.1957, now() + interval '4 days', '00000000-0000-0000-0001-000000000008', 'Catch a local band at The Lansdowne, drinks optional', ARRAY['live music','gigs'], 30, 45),
  ('00000000-0000-0000-0003-000000000005', 'forming',   3, 4, -33.8886, 151.1873, now() + interval '6 days', '00000000-0000-0000-0001-000000000011', 'Quiet coffee + study session before finals', ARRAY['coffee culture','study groups'], 10, 20)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- public.meetup_members
-- ---------------------------------------------------------------------------

insert into public.meetup_members (meetup_id, user_id, accepted, revealed, reroll_used) values
  -- confirmed meetup: active user + the 3 most-overlapping candidates
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0001-000000000001', true, true, false),
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0001-000000000002', true, true, false),
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0001-000000000003', true, true, false),
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0001-000000000004', true, true, false),
  -- Completed meetup: active user + Maya, who later mutually choose "meet again"
  ('00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0001-000000000001', true, true, false),
  ('00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0001-000000000002', true, true, false),
  -- Meetup A: Tom hosts Aisha for their shared board games interest
  ('00000000-0000-0000-0003-000000000003', '00000000-0000-0000-0001-000000000006', true, true, false),
  ('00000000-0000-0000-0003-000000000003', '00000000-0000-0000-0001-000000000009', true, true, false),
  -- Meetup B: Liam hosts with Tom pending
  ('00000000-0000-0000-0003-000000000004', '00000000-0000-0000-0001-000000000008', true, true, false),
  ('00000000-0000-0000-0003-000000000004', '00000000-0000-0000-0001-000000000006', false, false, false),
  -- Meetup C: Chloe hosts, still forming
  ('00000000-0000-0000-0003-000000000005', '00000000-0000-0000-0001-000000000011', true, true, false)
on conflict (meetup_id, user_id) do nothing;

-- ---------------------------------------------------------------------------
-- public.activity_recommendations
-- 01: confirmed meetup's live recommendation
-- 02: completed meetup's (past) recommendation, referenced by the momentum event
-- 03: meetup A, live board game café
-- 04: meetup B, live music night, $7 over budget
--     (PRD 9.8: "$5 to $10 above budget can appear as labelled recommendations")
-- 05: meetup C, coffee and study fallback
-- ---------------------------------------------------------------------------

insert into public.activity_recommendations (
  id, meetup_id, place_id, venue_name, activity_title, reason, est_cost_aud,
  est_distance_km, over_budget_pref, over_distance_pref, booking_url, source, raw_places_json
) values
  (
    '00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0003-000000000001',
    'ChIJDEMO_VICTORIA_PARK_001', 'Victoria Park Courts & Kiosk', 'Pickup Basketball + Bites',
    'Matched on your shared interest in basketball and food exploration — public courts and a highly-rated kiosk two minutes apart, both within everyone''s travel range.',
    18, 2.4, false, false, 'https://maps.google.com/?cid=demo-victoria-park', 'live',
    '{"id":"ChIJDEMO_VICTORIA_PARK_001","displayName":{"text":"Victoria Park Courts & Kiosk"},"formattedAddress":"Broadway, Camperdown NSW 2050","rating":4.4,"priceLevel":"PRICE_LEVEL_INEXPENSIVE","currentOpeningHours":{"openNow":true}}'::jsonb
  ),
  (
    '00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0003-000000000002',
    'ChIJDEMO_NEWTOWN_CAFES_002', 'Grind Espresso, Newtown', 'Café Hopping in Newtown',
    'Shared interest in food exploration — a short walking loop of well-reviewed independent cafés.',
    22, 3.1, false, false, 'https://maps.google.com/?cid=demo-newtown-cafes', 'live',
    '{"id":"ChIJDEMO_NEWTOWN_CAFES_002","displayName":{"text":"Grind Espresso"},"formattedAddress":"King St, Newtown NSW 2042","rating":4.6,"priceLevel":"PRICE_LEVEL_MODERATE","currentOpeningHours":{"openNow":true}}'::jsonb
  ),
  (
    '00000000-0000-0000-0004-000000000003', '00000000-0000-0000-0003-000000000003',
    'ChIJDEMO_BOARDGAME_CAFE_003', 'Hearthfire Board Game Café', 'Board Game Café Night',
    'Tom and Aisha both listed board games — this café has a 200+ title library and a quiet-ish back room.',
    16, 1.8, false, false, 'https://maps.google.com/?cid=demo-hearthfire', 'live',
    '{"id":"ChIJDEMO_BOARDGAME_CAFE_003","displayName":{"text":"Hearthfire Board Game Cafe"},"formattedAddress":"Broadway, Ultimo NSW 2007","rating":4.7,"priceLevel":"PRICE_LEVEL_MODERATE","currentOpeningHours":{"openNow":true}}'::jsonb
  ),
  (
    '00000000-0000-0000-0004-000000000004', '00000000-0000-0000-0003-000000000004',
    'ChIJDEMO_LANSDOWNE_004', 'The Lansdowne Hotel', 'Live Music Night',
    'Matches the group''s live music and gig interest. Estimated cost is about $7 above the group''s stated budget — flagged, not hidden.',
    42, 2.9, true, false, 'https://maps.google.com/?cid=demo-lansdowne', 'live',
    '{"id":"ChIJDEMO_LANSDOWNE_004","displayName":{"text":"The Lansdowne Hotel"},"formattedAddress":"2 City Rd, Chippendale NSW 2008","rating":4.3,"priceLevel":"PRICE_LEVEL_MODERATE","currentOpeningHours":{"openNow":true}}'::jsonb
  ),
  (
    '00000000-0000-0000-0004-000000000005', '00000000-0000-0000-0003-000000000005',
    null, 'Society Café', 'Coffee & Study Jam',
    'Places lookup for this slot fell back to a cached shortlist — venue facts here are from the last verified sync, not a fresh live call.',
    15, 1.2, false, false, null, 'fallback',
    null
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- public.chat_messages: 6 ordered messages on the confirmed meetup.
-- ---------------------------------------------------------------------------

insert into public.chat_messages (id, meetup_id, user_id, body, created_at) values
  ('00000000-0000-0000-0005-000000000001', '00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0001-000000000001', 'Hey team! Excited for Victoria Park later 🏀', now() - interval '48 minutes'),
  ('00000000-0000-0000-0005-000000000002', '00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0001-000000000002', 'Same!! Should we grab food after or before?', now() - interval '40 minutes'),
  ('00000000-0000-0000-0005-000000000003', '00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0001-000000000003', 'After works for me, I''m always down for food exploration', now() - interval '32 minutes'),
  ('00000000-0000-0000-0005-000000000004', '00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0001-000000000004', 'Sounds good, I''ll bring a spare ball just in case', now() - interval '24 minutes'),
  ('00000000-0000-0000-0005-000000000005', '00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0001-000000000001', 'Perfect, see everyone at 4?', now() - interval '16 minutes'),
  ('00000000-0000-0000-0005-000000000006', '00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0001-000000000004', 'Works for me 👍', now() - interval '8 minutes')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- public.momentum_events: one completed activity for the active user.
-- ---------------------------------------------------------------------------

insert into public.momentum_events (id, user_id, activity_id, week, completed_at, hours) values
  (
    '00000000-0000-0000-0009-000000000001',
    '00000000-0000-0000-0001-000000000001',
    '00000000-0000-0000-0004-000000000002',
    extract(week from (now() - interval '10 days'))::int,
    now() - interval '10 days',
    2.5
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- public.feedback: mutual "meet again" between the active user and Maya,
-- both tied to the completed meetup above.
-- ---------------------------------------------------------------------------

insert into public.feedback (id, meetup_id, from_user, about_user, group_reaction, meet_again, avoid_rematch, note) values
  (
    '00000000-0000-0000-0006-000000000001', '00000000-0000-0000-0003-000000000002',
    '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0001-000000000002',
    'great_group', true, false, 'Loved exploring Newtown cafes, would do this again!'
  ),
  (
    '00000000-0000-0000-0006-000000000002', '00000000-0000-0000-0003-000000000002',
    '00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0001-000000000001',
    'great_group', true, false, 'Such a fun afternoon, keen to hang out again.'
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- public.friendships resulting from the mutual "meet again" above.
-- ---------------------------------------------------------------------------

insert into public.friendships (user_a, user_b, via_meetup) values
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0003-000000000002')
on conflict (user_a, user_b) do nothing;
