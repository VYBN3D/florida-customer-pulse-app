-- Live scraper-fed dashboard data. Only invited/authenticated users can read.
create table if not exists public.pulse_records (
  record_type text not null check (record_type in ('mentions','mention_comments','menu_items','menu_stores','ommu_market','source_status','google_reviews_cache','meta_page_posts','meta_page_comments','meta_page_status','weedmaps_menus','weedmaps_products','weedmaps_reviews','sweed_menu_items','sweed_menu_stores','sweed_menu_categories')),
  record_id text not null,
  payload jsonb not null,
  record_hash text not null,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  primary key (record_type, record_id)
);
alter table public.pulse_records enable row level security;
drop policy if exists "Authorized users can read pulse records" on public.pulse_records;
create policy "Authorized users can read pulse records" on public.pulse_records
  for select to authenticated using (true);
revoke all on public.pulse_records from anon, authenticated;
grant select on public.pulse_records to authenticated;
grant all on public.pulse_records to service_role;

create table if not exists public.pulse_sync_state (
  id text primary key check (id = 'scraper'),
  last_success_at timestamptz not null default now(),
  last_run_id text not null,
  last_batch_records integer not null default 0,
  record_counts jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.pulse_sync_state enable row level security;
drop policy if exists "Authorized users can read pulse sync state" on public.pulse_sync_state;
create policy "Authorized users can read pulse sync state" on public.pulse_sync_state
  for select to authenticated using (true);
revoke all on public.pulse_sync_state from anon, authenticated;
grant select on public.pulse_sync_state to authenticated;
grant all on public.pulse_sync_state to service_role;
