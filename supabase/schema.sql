-- Florida Customer Pulse account model.
-- Run in the Supabase SQL editor after creating the project.
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'standard' check (role in ('admin','standard')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

drop policy if exists "Users can read their own profile" on public.user_profiles;
create policy "Users can read their own profile"
  on public.user_profiles for select
  to authenticated
  using (auth.uid() = user_id);

-- No client-side insert/update/delete policies: role changes are server-only.
revoke all on public.user_profiles from anon, authenticated;
grant select on public.user_profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (user_id, email, role)
  values (new.id, coalesce(new.email, ''), 'standard')
  on conflict (user_id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- IMPORTANT: after the first administrator has accepted an invitation,
-- replace the email below with that exact account email and run this once.
-- Do not expose service-role credentials in the browser.
-- update public.user_profiles set role = 'admin' where lower(email) = lower('YOUR_ADMIN_EMAIL');
