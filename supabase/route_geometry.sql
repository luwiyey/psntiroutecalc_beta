create extension if not exists pgcrypto;

create table if not exists public.route_landmarks (
  id uuid primary key default gen_random_uuid(),
  route_id text not null,
  route_label text not null,
  stop_name text not null,
  km double precision not null,
  latitude double precision,
  longitude double precision,
  radius_meters integer,
  google_place_id text,
  google_maps_query text,
  aliases jsonb not null default '[]'::jsonb,
  source text not null default 'seeded' check (source in ('seeded', 'manual', 'place-search', 'road-snapped')),
  confidence_score numeric(5,2) not null default 0.10,
  updated_at timestamptz not null default now(),
  unique (route_id, stop_name)
);

create index if not exists route_landmarks_route_idx
  on public.route_landmarks (route_id, km asc);

create table if not exists public.route_segments (
  id uuid primary key default gen_random_uuid(),
  route_id text not null,
  route_label text not null,
  start_stop_name text not null,
  end_stop_name text not null,
  start_km double precision not null,
  end_km double precision not null,
  path_points jsonb not null default '[]'::jsonb,
  source text not null default 'seeded' check (source in ('seeded', 'manual', 'road-snapped')),
  confidence_score numeric(5,2) not null default 0.10,
  updated_at timestamptz not null default now(),
  unique (route_id, start_stop_name, end_stop_name)
);

create index if not exists route_segments_route_idx
  on public.route_segments (route_id, start_km asc, end_km asc);

alter table public.route_landmarks enable row level security;
alter table public.route_segments enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'route_landmarks'
      and policyname = 'route landmarks readable by everyone'
  ) then
    create policy "route landmarks readable by everyone"
      on public.route_landmarks
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'route_landmarks'
      and policyname = 'route landmarks writable by everyone'
  ) then
    create policy "route landmarks writable by everyone"
      on public.route_landmarks
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'route_landmarks'
      and policyname = 'route landmarks updatable by everyone'
  ) then
    create policy "route landmarks updatable by everyone"
      on public.route_landmarks
      for update
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'route_segments'
      and policyname = 'route segments readable by everyone'
  ) then
    create policy "route segments readable by everyone"
      on public.route_segments
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'route_segments'
      and policyname = 'route segments writable by everyone'
  ) then
    create policy "route segments writable by everyone"
      on public.route_segments
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'route_segments'
      and policyname = 'route segments updatable by everyone'
  ) then
    create policy "route segments updatable by everyone"
      on public.route_segments
      for update
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end
$$;
