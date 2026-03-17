-- Playlist episodes (ordered list of episodes in a playlist)
create table public.playlist_episodes (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  episode_guid text not null,
  feed_url text not null,
  position integer not null default 0,
  added_at timestamptz default now(),
  unique(playlist_id, episode_guid)
);

alter table public.playlist_episodes enable row level security;

-- Owner can manage episodes (via playlist ownership)
create policy "Users can manage episodes in their own playlists" on public.playlist_episodes
  for all using (
    exists (
      select 1 from public.playlists
      where playlists.id = playlist_id
      and playlists.user_id = auth.uid()
    )
  );

-- Authenticated users can read episodes of public playlists
create policy "Authenticated users can read episodes of public playlists" on public.playlist_episodes
  for select using (
    exists (
      select 1 from public.playlists
      where playlists.id = playlist_id
      and playlists.is_public = true
      and auth.role() = 'authenticated'
    )
  );
