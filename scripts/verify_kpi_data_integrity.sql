-- KPI Data Integrity Verification Pack
-- Run in Supabase SQL editor (or psql) to validate HubSpot -> Supabase -> KPI readiness.
-- Canonical rules:
-- - Qualified = revenue >= 250000 AND sobriety > 1 year
-- - Official revenue first; fallback revenue only when official is missing
-- - Good/Great tiers are revenue-only

set timezone to 'UTC';

-- 1) Leads contract metrics (7/30/90 day windows)
with windows as (
  select * from (values (7), (30), (90)) as t(window_days)
),
contacts as (
  select
    c.hubspot_contact_id,
    c.createdate::date as created_date_utc,
    nullif(c.annual_revenue_in_dollars__official_::text, '')::numeric as official_revenue,
    nullif(c.annual_revenue_in_dollars::text, '')::numeric as fallback_revenue,
    coalesce(
      nullif(c.sobriety_date__official_::text, ''),
      nullif(c.sobriety_date::text, ''),
      nullif(c.sober_date::text, ''),
      nullif(c.clean_date::text, '')
    ) as sobriety_raw
  from public.raw_hubspot_contacts c
  where coalesce(c.is_deleted, false) = false
    and c.createdate >= now() - interval '95 days'
),
contacts_normalized as (
  select
    c.*,
    case
      when c.sobriety_raw ~ '^\d{4}-\d{2}-\d{2}$' then c.sobriety_raw::date
      when c.sobriety_raw ~ '^\d{1,2}/\d{1,2}/\d{4}$' then to_date(c.sobriety_raw, 'MM/DD/YYYY')
      else null
    end as sobriety_date
  from contacts c
),
leads_windowed as (
  select
    w.window_days,
    c.*
  from windows w
  join contacts_normalized c
    on c.created_date_utc >= (current_date - make_interval(days => w.window_days))
),
leads_aggregated as (
  select
    window_days,
    count(*)::bigint as total_count,
    count(*) filter (
      where (
        (
          official_revenue is not null and official_revenue >= 250000
        ) or (
          official_revenue is null
          and fallback_revenue is not null
          and fallback_revenue >= 250000
        )
      )
      and sobriety_date is not null
      and (sobriety_date + interval '1 year')::date < current_date
    )::bigint as qualified_count,
    count(*) filter (
      where official_revenue is not null
        and official_revenue >= 250000
        and sobriety_date is not null
        and (sobriety_date + interval '1 year')::date < current_date
    )::bigint as official_qualified_count,
    count(*) filter (
      where official_revenue is null
        and fallback_revenue is not null
        and fallback_revenue >= 250000
        and sobriety_date is not null
        and (sobriety_date + interval '1 year')::date < current_date
    )::bigint as fallback_qualified_count,
    count(*) filter (
      where coalesce(official_revenue, fallback_revenue) >= 250000
        and coalesce(official_revenue, fallback_revenue) < 1000000
    )::bigint as good_count,
    count(*) filter (
      where coalesce(official_revenue, fallback_revenue) >= 1000000
    )::bigint as great_count,
    count(*) filter (
      where official_revenue is null and fallback_revenue is null
    )::bigint as missing_revenue_count,
    count(*) filter (
      where sobriety_date is null
    )::bigint as missing_sobriety_count
  from leads_windowed
  group by window_days
)
select
  window_days,
  total_count,
  qualified_count,
  official_qualified_count,
  fallback_qualified_count,
  case when total_count > 0 then round((qualified_count::numeric / total_count::numeric) * 100, 2) else null end as qualified_pct,
  case when qualified_count > 0 then round((fallback_qualified_count::numeric / qualified_count::numeric) * 100, 2) else null end as fallback_share_pct,
  good_count,
  great_count,
  missing_revenue_count,
  missing_sobriety_count
from leads_aggregated
order by window_days;

-- 2) Duplicate guard rails
select
  (select count(*) from (
    select hubspot_contact_id
    from public.raw_hubspot_contacts
    group by hubspot_contact_id
    having count(*) > 1
  ) t) as duplicate_contact_id_groups,
  (select count(*) from (
    select hubspot_activity_id, activity_type, hubspot_contact_id, coalesce(association_type, '')
    from public.hubspot_activity_contact_associations
    group by hubspot_activity_id, activity_type, hubspot_contact_id, coalesce(association_type, '')
    having count(*) > 1
  ) t) as duplicate_activity_association_groups;

-- 3) Sync health guard rails
select
  count(*) filter (where coalesce(is_stale, false))::bigint as stale_rows,
  count(*) filter (where coalesce(dead_events, 0) > 0)::bigint as dead_event_rows,
  count(*) filter (where coalesce(latest_status, 'error') not in ('success', 'partial'))::bigint as unhealthy_rows
from public.vw_hubspot_sync_health_observability;

-- 4) Attendance contract metrics (7/30/90 windows)
with windows as (
  select * from (values (7), (30), (90)) as t(window_days)
),
activities as (
  select
    a.hubspot_activity_id,
    lower(coalesce(a.activity_type, '')) as activity_type,
    coalesce(a.hs_timestamp, a.created_at_hubspot, a.updated_at_hubspot) as activity_ts_utc,
    lower(coalesce(a.title, '')) as title
  from public.raw_hubspot_meeting_activities a
  where coalesce(a.is_deleted, false) = false
    and coalesce(a.hs_timestamp, a.created_at_hubspot, a.updated_at_hubspot) >= now() - interval '95 days'
),
activities_classified as (
  select
    a.*,
    (a.activity_ts_utc at time zone 'America/New_York')::date as activity_date_et,
    trim(to_char(a.activity_ts_utc at time zone 'America/New_York', 'Dy')) as weekday_short,
    (
      extract(hour from a.activity_ts_utc at time zone 'America/New_York')::int * 60
      + extract(minute from a.activity_ts_utc at time zone 'America/New_York')::int
    ) as minute_of_day_et
  from activities a
  where a.activity_type in ('call', 'meeting')
),
group_sessions as (
  select
    a.hubspot_activity_id,
    a.activity_type,
    a.activity_date_et,
    case
      when a.title like '%tactic tuesday%' then 'Tuesday'
      when a.title like '%mastermind on zoom%'
        or a.title like '%all are welcome%'
        or a.title like '%entrepreneur''s big book%'
        or a.title like '%big book%' then 'Thursday'
      when a.weekday_short = 'Tue' and abs(a.minute_of_day_et - 720) <= 120 then 'Tuesday'
      when a.weekday_short = 'Thu' and abs(a.minute_of_day_et - 660) <= 120 then 'Thursday'
      else null
    end as group_type
  from activities_classified a
),
session_contacts as (
  select
    s.group_type,
    s.activity_date_et,
    assoc.hubspot_contact_id
  from group_sessions s
  join public.hubspot_activity_contact_associations assoc
    on assoc.hubspot_activity_id = s.hubspot_activity_id
   and lower(coalesce(assoc.activity_type, '')) = s.activity_type
  where s.group_type is not null
),
windowed_contacts as (
  select
    w.window_days,
    sc.*
  from windows w
  join session_contacts sc
    on sc.activity_date_et >= (current_date - make_interval(days => w.window_days))
),
first_seen as (
  select
    window_days,
    hubspot_contact_id,
    min(activity_date_et) as first_seen_date
  from windowed_contacts
  group by window_days, hubspot_contact_id
)
select
  wc.window_days,
  count(distinct wc.activity_date_et) filter (where wc.group_type = 'Tuesday')::bigint as tuesday_session_count,
  count(distinct wc.activity_date_et) filter (where wc.group_type = 'Thursday')::bigint as thursday_session_count,
  count(distinct wc.hubspot_contact_id) filter (where wc.group_type = 'Tuesday')::bigint as tuesday_unique_contacts,
  count(distinct wc.hubspot_contact_id) filter (where wc.group_type = 'Thursday')::bigint as thursday_unique_contacts,
  count(*)::bigint as attendance_events,
  count(distinct wc.hubspot_contact_id)::bigint as distinct_contacts,
  count(distinct fs.hubspot_contact_id)::bigint as new_attendees_count,
  case
    when count(distinct wc.hubspot_contact_id) > 0
      then round(count(*)::numeric / count(distinct wc.hubspot_contact_id)::numeric, 2)
    else null
  end as avg_attendance_per_person
from windowed_contacts wc
join first_seen fs
  on fs.window_days = wc.window_days
 and fs.hubspot_contact_id = wc.hubspot_contact_id
group by wc.window_days
order by wc.window_days;

-- 5) PASS/FAIL gate summary
with duplicate_checks as (
  select
    (select count(*) from (
      select hubspot_contact_id
      from public.raw_hubspot_contacts
      group by hubspot_contact_id
      having count(*) > 1
    ) t) as duplicate_contact_id_groups,
    (select count(*) from (
      select hubspot_activity_id, activity_type, hubspot_contact_id, coalesce(association_type, '')
      from public.hubspot_activity_contact_associations
      group by hubspot_activity_id, activity_type, hubspot_contact_id, coalesce(association_type, '')
      having count(*) > 1
    ) t) as duplicate_association_groups
),
sync_checks as (
  select
    count(*) filter (where coalesce(is_stale, false))::bigint as stale_rows,
    count(*) filter (where coalesce(dead_events, 0) > 0)::bigint as dead_event_rows,
    count(*) filter (where coalesce(latest_status, 'error') not in ('success', 'partial'))::bigint as unhealthy_rows
  from public.vw_hubspot_sync_health_observability
)
select
  case
    when dc.duplicate_contact_id_groups = 0
      and dc.duplicate_association_groups = 0
      and sc.stale_rows = 0
      and sc.dead_event_rows = 0
      and sc.unhealthy_rows = 0
    then 'PASS'
    else 'FAIL'
  end as integrity_gate,
  dc.duplicate_contact_id_groups,
  dc.duplicate_association_groups,
  sc.stale_rows,
  sc.dead_event_rows,
  sc.unhealthy_rows,
  now() as evaluated_at_utc
from duplicate_checks dc
cross join sync_checks sc;
