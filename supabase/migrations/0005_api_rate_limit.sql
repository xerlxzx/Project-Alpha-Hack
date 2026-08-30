-- Global daily counter for routes that spend Gemini/Places quota
-- (venue-agent, meetups/[id]/reroll, feedback). One row per UTC day;
-- increment_api_rate_limit atomically bumps the count and reports whether
-- the caller landed under the limit, so concurrent requests can't race past it.

create table if not exists public.api_rate_limits (
  day date primary key,
  count integer not null default 0
);

create or replace function public.increment_api_rate_limit(p_day date, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.api_rate_limits (day, count)
  values (p_day, 1)
  on conflict (day) do update set count = api_rate_limits.count + 1
  returning count into new_count;

  return new_count <= p_limit;
end;
$$;
