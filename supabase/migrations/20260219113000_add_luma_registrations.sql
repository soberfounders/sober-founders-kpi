-- Thursday Lu.ma registrations with Zoom + HubSpot integrity matching.
create table if not exists public.raw_luma_registrations (
  id uuid primary key default gen_random_uuid(),
  event_api_id text not null,
  event_name text,
  event_url text,
  event_start_at timestamptz,
  event_date date,
  event_timezone text,
  zoom_meeting_id text,
  is_thursday boolean not null default false,
  guest_api_id text not null,
  guest_name text,
  guest_email text,
  registered_at timestamptz,
  joined_at timestamptz,
  approval_status text,
  custom_source text,
  registration_answers jsonb not null default '[]'::jsonb,
  matched_zoom boolean not null default false,
  matched_zoom_date date,
  matched_zoom_name text,
  matched_zoom_net_new boolean not null default false,
  matched_hubspot boolean not null default false,
  matched_hubspot_contact_id bigint,
  matched_hubspot_name text,
  matched_hubspot_email text,
  matched_hubspot_revenue numeric,
  matched_hubspot_tier text,
  funnel_key text not null default 'free',
  event_payload jsonb not null default '{}'::jsonb,
  guest_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_api_id, guest_api_id)
);

create index if not exists idx_raw_luma_reg_event_date on public.raw_luma_registrations (event_date);
create index if not exists idx_raw_luma_reg_email on public.raw_luma_registrations (guest_email);
create index if not exists idx_raw_luma_reg_zoom on public.raw_luma_registrations (matched_zoom, matched_zoom_net_new);
create index if not exists idx_raw_luma_reg_hubspot on public.raw_luma_registrations (matched_hubspot);
create index if not exists idx_raw_luma_reg_zoom_meeting_id on public.raw_luma_registrations (zoom_meeting_id);

alter table public.raw_luma_registrations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'raw_luma_registrations'
      and policyname = 'Public read raw_luma_registrations'
  ) then
    create policy "Public read raw_luma_registrations"
      on public.raw_luma_registrations
      for select to anon, authenticated
      using (true);
  end if;
end
$$;
