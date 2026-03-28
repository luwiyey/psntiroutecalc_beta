create extension if not exists pgcrypto;

create table if not exists public.stop_submissions (
  id uuid primary key default gen_random_uuid(),
  client_submission_id text not null unique,
  route_id text not null,
  route_label text not null,
  stop_name text not null,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_meters double precision not null,
  radius_meters integer not null default 60,
  sample_count integer not null default 1,
  source text not null check (source in ('native', 'browser')),
  employee_id text,
  employee_name text,
  device_id text,
  notes text,
  submitted_at timestamptz not null default now()
);

create index if not exists stop_submissions_route_idx
  on public.stop_submissions (route_id, stop_name, submitted_at desc);

alter table public.stop_submissions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'stop_submissions'
      and policyname = 'stop submissions readable by everyone'
  ) then
    create policy "stop submissions readable by everyone"
      on public.stop_submissions
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'stop_submissions'
      and policyname = 'allow stop submission inserts'
  ) then
    create policy "allow stop submission inserts"
      on public.stop_submissions
      for insert
      to anon, authenticated
      with check (true);
  end if;
end
$$;
