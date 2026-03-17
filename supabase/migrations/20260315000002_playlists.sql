-- Playlists (named, reusable episode lists)
create table public.playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  is_public boolean not null default false,
  position integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.playlists enable row level security;

-- Owner has full access
create policy "Users can manage their own playlists" on public.playlists
  for all using (auth.uid() = user_id);

-- Authenticated users can read public playlists
create policy "Authenticated users can read public playlists" on public.playlists
  for select using (auth.role() = 'authenticated' and is_public = true);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger playlists_updated_at
  before update on public.playlists
  for each row execute function public.set_updated_at();
