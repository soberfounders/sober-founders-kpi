-- Create table for manual attendee overrides
create table public.attendee_aliases (
  id uuid primary key default gen_random_uuid(),
  original_name text unique not null,
  target_name text not null,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.attendee_aliases enable row level security;

-- Policy: Allow authenticated users to select
create policy "Enable read access for authenticated users"
on public.attendee_aliases for select
to authenticated
using (true);

-- Policy: Allow authenticated users to insert
create policy "Enable insert access for authenticated users"
on public.attendee_aliases for insert
to authenticated
with check (true);

-- Policy: Allow authenticated users to delete
create policy "Enable delete access for authenticated users"
on public.attendee_aliases for delete
to authenticated
using (true);
