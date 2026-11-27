-- Separate, authenticated status channel for the VYBN Cannabis Research portal.
create table if not exists public.scraper_portal_state (
  id text primary key check (id = 'latest'),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.scraper_portal_state enable row level security;
drop policy if exists "Invited users can read scraper portal state" on public.scraper_portal_state;
create policy "Invited users can read scraper portal state" on public.scraper_portal_state
  for select to authenticated using (true);
revoke all on public.scraper_portal_state from anon, authenticated;
grant select on public.scraper_portal_state to authenticated;
grant all on public.scraper_portal_state to service_role;
