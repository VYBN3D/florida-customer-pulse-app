-- Authenticated remote start/stop queue. Only service_role can access rows.
create table if not exists public.scraper_portal_commands (
 id uuid primary key default gen_random_uuid(),
 action text not null check (action in ('start','stop')),
 status text not null default 'queued' check (status in ('queued','claimed','succeeded','failed')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 claimed_at timestamptz,
 completed_at timestamptz,
 result text
);
create index if not exists scraper_portal_commands_recent_idx on public.scraper_portal_commands(created_at desc);
alter table public.scraper_portal_commands enable row level security;
revoke all on public.scraper_portal_commands from anon, authenticated;
grant all on public.scraper_portal_commands to service_role;
