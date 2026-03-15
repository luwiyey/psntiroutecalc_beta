# Analytics Setup

This app can send conductor and route usage analytics to a free Supabase project.

## What gets tracked

- Login and logout
- Route selection
- Fare records
- GPS request, success, and failure
- Tally save and tally box clear
- PWD checker open
- Audit export
- Install prompt, app installed, update available, update refresh

Each event can include:

- `employee_id`
- `employee_name`
- `device_id`
- `route_id`
- `route_label`
- `app_surface`
- extra `metadata`

## Free setup

1. Create a free Supabase project.
2. Open the SQL editor and run:
   - [analytics_events.sql](/c:/Users/hwawei/Desktop/PSNTI%20RouteCalc1/supabase/analytics_events.sql)
3. Copy `.env.example` to `.env.local`
4. Fill in:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
5. Restart the dev server or redeploy.

## Notes

- If Supabase is not configured, the app still works normally.
- Events are kept locally in recent history, but cross-device analytics will not sync until Supabase keys are added.
- If the user is offline, analytics events queue locally and flush when the app goes online again.
- Do not put your database password in the app. The browser only needs the safe public project URL and publishable key.

## Useful queries

Top routes:

```sql
select route_label, count(*) as total
from public.analytics_events
where event_type in ('route_selected', 'fare_recorded', 'tally_saved')
group by route_label
order by total desc;
```

Most active conductors:

```sql
select employee_name, employee_id, count(*) as total_events
from public.analytics_events
where employee_id is not null
group by employee_name, employee_id
order by total_events desc;
```

Most active devices:

```sql
select device_id, count(*) as total_events
from public.analytics_events
where device_id is not null
group by device_id
order by total_events desc;
```

GPS failures:

```sql
select route_label, count(*) as failures
from public.analytics_events
where event_type = 'gps_failed'
group by route_label
order by failures desc;
```
