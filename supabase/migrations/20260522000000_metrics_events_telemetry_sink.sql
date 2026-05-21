-- JUN-11 — telemetry sink for the Profilo onboarding funnel.
--
-- Canonical record of the schema applied to the Supabase project
-- (ztyvlgvxffssyamsibpf). Applied via the Supabase management API; this file
-- keeps the schema version-controlled alongside the client that writes to it
-- (src/js/metrics.js).
--
-- Closes JUN-1 audit gap G1: track() previously wrote events to localStorage
-- only, so funnel metrics could never be aggregated across devices/sessions.

-- metrics_events: central, append-only telemetry log.
create table if not exists public.metrics_events (
  event_id    uuid primary key,
  event       text not null,
  props       jsonb not null default '{}'::jsonb,
  session_id  text,
  -- Derived from props so cross-device time-to-value can group by user.
  user_id     text generated always as (nullif(props ->> 'userId', '')) stored,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint metrics_events_event_len   check (char_length(event) <= 64),
  constraint metrics_events_session_len check (session_id is null or char_length(session_id) <= 128)
);

create index if not exists metrics_events_event_idx    on public.metrics_events (event);
create index if not exists metrics_events_occurred_idx on public.metrics_events (occurred_at);
create index if not exists metrics_events_session_idx  on public.metrics_events (session_id);
create index if not exists metrics_events_user_idx     on public.metrics_events (user_id);

-- RLS on with no policy: anon/authenticated cannot read or write the table
-- directly. The ingest RPC below is the only write path; reads run server-side
-- (the views below) under service_role / the SQL editor.
alter table public.metrics_events enable row level security;

-- Idempotent batch ingest. SECURITY DEFINER so it can write past RLS; it
-- still only ever appends validated rows and dedupes on the client-generated
-- event_id, so a retried batch never double-counts. This is the public ingest
-- endpoint: POST /rest/v1/rpc/ingest_metrics_events with
-- {"events":[{event_id,event,props,session_id,occurred_at}, ...]}.
create or replace function public.ingest_metrics_events(events jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer;
begin
  insert into public.metrics_events (event_id, event, props, session_id, occurred_at)
  select
    (e ->> 'event_id')::uuid,
    e ->> 'event',
    coalesce(e -> 'props', '{}'::jsonb),
    nullif(e ->> 'session_id', ''),
    (e ->> 'occurred_at')::timestamptz
  from jsonb_array_elements(coalesce(events, '[]'::jsonb)) as e
  on conflict (event_id) do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

comment on function public.ingest_metrics_events(jsonb) is
  'Append-only telemetry ingest for the onboarding funnel (JUN-11). Accepts '
  '{"events":[{event_id,event,props,session_id,occurred_at}, ...]}, dedupes on '
  'event_id, returns the number of newly-inserted rows.';

revoke all on function public.ingest_metrics_events(jsonb) from public;
grant execute on function public.ingest_metrics_events(jsonb) to anon, authenticated;

-- Cross-device funnel summary: the server-side equivalent of getFunnel().
-- security_invoker keeps the view honest to the caller's RLS; service_role
-- (and the SQL editor's postgres role) bypass RLS and see the full log.
create or replace view public.metrics_funnel
with (security_invoker = on) as
with per_user as (
  select
    user_id,
    min(occurred_at) filter (where event = 'signup_complete')   as signup_at,
    min(occurred_at) filter (where event = 'profile_published') as publish_at
  from public.metrics_events
  where user_id is not null
  group by user_id
),
ttv as (
  select extract(epoch from (publish_at - signup_at)) * 1000 as ms
  from per_user
  where signup_at is not null
    and publish_at is not null
    and publish_at >= signup_at
),
counts as (
  select
    count(*) filter (where event = 'landing_view')        as landing_views,
    count(*) filter (where event = 'signup_start')        as signup_starts,
    count(*) filter (where event = 'signup_complete')     as signups,
    count(*) filter (where event = 'onboarding_complete') as onboarding_completions,
    count(*) filter (where event = 'profile_published')   as publishes,
    count(*) filter (where event = 'edit_profile')        as edit_profile_entries,
    count(distinct session_id)                            as sessions
  from public.metrics_events
)
select
  c.landing_views,
  c.signup_starts,
  c.signups,
  c.onboarding_completions,
  c.publishes,
  c.edit_profile_entries,
  c.sessions,
  case when c.landing_views > 0
       then round(c.signup_starts::numeric / c.landing_views, 4) else 0 end as signup_start_rate,
  case when c.signups > 0
       then round(c.onboarding_completions::numeric / c.signups, 4) else 0 end as completion_rate,
  (select percentile_cont(0.5) within group (order by ms) from ttv) as median_time_to_value_ms
from counts c;

-- Per-user time-to-value (signup_complete -> first profile_published).
create or replace view public.metrics_time_to_value
with (security_invoker = on) as
select
  user_id,
  min(occurred_at) filter (where event = 'signup_complete')   as signup_at,
  min(occurred_at) filter (where event = 'profile_published') as publish_at,
  extract(epoch from (
    min(occurred_at) filter (where event = 'profile_published')
    - min(occurred_at) filter (where event = 'signup_complete')
  )) * 1000 as time_to_value_ms
from public.metrics_events
where user_id is not null
group by user_id;

grant select on public.metrics_funnel        to service_role;
grant select on public.metrics_time_to_value to service_role;

-- The raw log and the funnel views are written only via the ingest RPC and
-- read only server-side. Revoke the SELECT privileges Supabase's default
-- privileges attach, so none of these objects are readable or discoverable
-- by anon/authenticated (defence in depth on top of RLS).
revoke all on public.metrics_events        from anon, authenticated;
revoke all on public.metrics_funnel        from anon, authenticated;
revoke all on public.metrics_time_to_value from anon, authenticated;
