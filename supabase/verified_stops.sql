create extension if not exists pgcrypto;

create table if not exists public.verified_stops (
  id uuid primary key default gen_random_uuid(),
  route_id text not null,
  route_label text not null,
  stop_name text not null,
  latitude double precision not null,
  longitude double precision not null,
  radius_meters integer not null default 60,
  sample_count integer not null default 1,
  submission_count integer not null default 1,
  confidence_score double precision not null default 0,
  source text not null default 'computed' check (source in ('computed', 'manual')),
  updated_at timestamptz not null default now(),
  unique (route_id, stop_name)
);

create index if not exists verified_stops_route_idx
  on public.verified_stops (route_id, updated_at desc);

alter table public.verified_stops enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'verified_stops'
      and policyname = 'verified stops readable by everyone'
  ) then
    create policy "verified stops readable by everyone"
      on public.verified_stops
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'verified_stops'
      and policyname = 'allow verified stop inserts'
  ) then
    create policy "allow verified stop inserts"
      on public.verified_stops
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'verified_stops'
      and policyname = 'allow verified stop updates'
  ) then
    create policy "allow verified stop updates"
      on public.verified_stops
      for update
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end
$$;
