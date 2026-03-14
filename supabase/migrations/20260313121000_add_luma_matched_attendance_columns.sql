-- Add HubSpot-attendance semantic columns while preserving legacy matched_zoom* columns.
-- This is a compatibility migration: existing consumers keep working, new code can read/write matched_attendance*.

alter table if exists public.raw_luma_registrations
  add column if not exists matched_attendance boolean not null default false,
  add column if not exists matched_attendance_date date,
  add column if not exists matched_attendance_name text,
  add column if not exists matched_attendance_net_new boolean not null default false;

-- Backfill from legacy columns so historical data stays unchanged.
update public.raw_luma_registrations
set
  matched_attendance = coalesce(matched_zoom, false),
  matched_attendance_date = coalesce(matched_attendance_date, matched_zoom_date),
  matched_attendance_name = coalesce(matched_attendance_name, matched_zoom_name),
  matched_attendance_net_new = coalesce(matched_zoom_net_new, false);

create index if not exists idx_raw_luma_reg_attendance
  on public.raw_luma_registrations (matched_attendance, matched_attendance_net_new);
