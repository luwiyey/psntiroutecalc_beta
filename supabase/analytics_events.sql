create table if not exists public.analytics_events (
  event_id text primary key,
  event_type text not null,
  created_at timestamptz not null default now(),
  employee_id text,
  employee_name text,
  device_id text,
  route_id text,
  route_label text,
  app_surface text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists analytics_events_created_at_idx on public.analytics_events (created_at desc);
create index if not exists analytics_events_event_type_idx on public.analytics_events (event_type);
create index if not exists analytics_events_route_id_idx on public.analytics_events (route_id);
create index if not exists analytics_events_employee_id_idx on public.analytics_events (employee_id);
create index if not exists analytics_events_device_id_idx on public.analytics_events (device_id);

alter table public.analytics_events enable row level security;

drop policy if exists "anon_insert_analytics_events" on public.analytics_events;
create policy "anon_insert_analytics_events"
on public.analytics_events
for insert
to anon, authenticated
with check (true);

comment on table public.analytics_events is 'PSNTI RouteCalc usage and operational analytics events';

-- Sample queries for dashboard use:
-- Top routes used
-- select route_label, count(*) as total
-- from public.analytics_events
-- where event_type in ('route_selected', 'fare_recorded', 'tally_saved')
-- group by route_label
-- order by total desc;

-- Most active conductors
-- select employee_name, employee_id, count(*) as total_events
-- from public.analytics_events
-- where employee_id is not null
-- group by employee_name, employee_id
-- order by total_events desc;

-- Active devices
-- select device_id, count(*) as total_events
-- from public.analytics_events
-- where device_id is not null
-- group by device_id
-- order by total_events desc;

-- GPS failures by browser
-- select metadata->>'user_agent' as user_agent, count(*) as failures
-- from public.analytics_events
-- where event_type = 'gps_failed'
-- group by metadata->>'user_agent'
-- order by failures desc;
